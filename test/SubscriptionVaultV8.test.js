const { expect } = require("chai");
const { ethers } = require("hardhat");
const { time } = require("@nomicfoundation/hardhat-network-helpers");

const WEEKLY = 0; // Interval.Weekly

// Hardhat's default local network seeds accounts from this well-known test
// mnemonic. getSigners() returns JSON-RPC-backed signer objects with no
// exposed private key, but ERC-1271 signature verification here needs a raw
// secp256k1 signature over an arbitrary 32-byte digest (no EIP-191 prefix) —
// which requires the actual private key. Deriving a local ethers.Wallet from
// the same mnemonic/path gives the identical address with real signing key
// access, purely for test purposes.
const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";

function localWalletFor(index) {
  return ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${index}`);
}

// Sign a raw 32-byte digest directly (no EIP-191 prefix) — matches what
// IERC1271.isValidSignature(hash, sig) expects via ecrecover in our test wallets.
function signDigest(localWallet, digestHex) {
  const sig = localWallet.signingKey.sign(digestHex);
  // r (32) + s (32) + v (1), matching the assembly parsing in TestWallet/ConstructorSubscriber.
  return ethers.concat([sig.r, sig.s, ethers.toBeHex(sig.v, 1)]);
}

describe("SubscriptionVault v8 patches", function () {
  let vault, token, registry;
  let admin, keeper, treasury, merchant, subscriber, guardian, newVaultOwner;

  const AMOUNT = 100_000000n; // 100 USDC, 6 decimals

  beforeEach(async function () {
    [admin, keeper, treasury, merchant, subscriber, guardian, newVaultOwner] =
      await ethers.getSigners();

    const MockERC20 = await ethers.getContractFactory("MockERC20");
    token = await MockERC20.deploy();

    const MockMerchantRegistry = await ethers.getContractFactory("MockMerchantRegistry");
    registry = await MockMerchantRegistry.deploy();
    await registry.setApproved(merchant.address, true);

    const SubscriptionVault = await ethers.getContractFactory("SubscriptionVault");
    vault = await SubscriptionVault.deploy(
      admin.address,
      keeper.address,
      treasury.address,
      await registry.getAddress()
    );

    await vault.connect(admin).approveToken(await token.getAddress());

    // Sanity check: confirm our derived local wallet actually matches the
    // subscriber signer's address before relying on it for signatures below.
    expect(localWalletFor(4).address).to.equal(subscriber.address);
  });

  // ===========================================================================
  // SV-17 — trial delay fix
  // ===========================================================================
  describe("SV-17: trial period no longer adds an extra billing interval", function () {
    it("is NOT due at trialEndsAt + interval minus a few seconds, but IS due at trialEndsAt", async function () {
      await token.mint(subscriber.address, AMOUNT * 10n);
      await token.connect(subscriber).approve(await vault.getAddress(), AMOUNT * 10n);

      const trialDays = 7;
      const tx = await vault.connect(subscriber).createSubscription(
        merchant.address,
        subscriber.address,
        await token.getAddress(),
        AMOUNT,
        0, 0,
        WEEKLY,
        ethers.ZeroAddress,
        trialDays,
        0,
        ethers.ZeroHexString ? ethers.ZeroHash : ethers.ZeroHash
      );
      const receipt = await tx.wait();
      const id = 0n; // first subscription

      const sub = await vault.subscriptions(id);
      const trialEndsAt = sub.trialEndsAt;

      // Jump to 2 seconds BEFORE trialEndsAt — must NOT be due yet.
      // (Leaving a 2s buffer, not 1s: Hardhat mines the executePull tx itself
      // at +1s from whatever "latest" was set to, so a 1s buffer gets
      // consumed by block-mining alone before the check even runs.)
      await time.increaseTo(trialEndsAt - 2n);
      await expect(
        vault.connect(keeper).executePull(id, 0, "0x")
      ).to.be.revertedWith("NotDueYet");

      // Jump to exactly trialEndsAt — THIS is the bug fix under test.
      // Pre-patch, this would still revert NotDueYet because lastPulledAt was
      // trialEndsAt itself, requiring + one full WEEKLY interval on top.
      await time.increaseTo(trialEndsAt);
      await expect(
        vault.connect(keeper).executePull(id, 0, "0x")
      ).to.emit(vault, "PaymentExecuted");
    });
  });

  // ===========================================================================
  // SV-19 — ERC-1271 constructor-bypass fix
  // ===========================================================================
  describe("SV-19: constructor-bypass is closed by live recheck at pull time", function () {
    it("blocks a pull with no signature once the bypass wallet is genuinely deployed", async function () {
      const ConstructorSubscriber = await ethers.getContractFactory("ConstructorSubscriber");

      // Deploying this contract itself performs createSubscription() from
      // inside its own constructor — reproducing the pre-SV-19 bypass.
      const bypassWallet = await ConstructorSubscriber.deploy(
        await vault.getAddress(),
        subscriber.address, // owner (signs on the wallet's behalf)
        merchant.address,
        await token.getAddress(),
        AMOUNT
      );
      await bypassWallet.waitForDeployment();

      const id = 0n;
      const sub = await vault.subscriptions(id);
      // Confirms the bypass actually happened at creation time, as expected.
      expect(sub.isContractVault).to.equal(false);

      // Fund and approve the (now deployed) wallet so a pull attempt gets
      // past the balance/allowance checks and reaches the signature gate.
      await token.mint(await bypassWallet.getAddress(), AMOUNT * 10n);
      await bypassWallet.connect(subscriber).approveSpender(
        await token.getAddress(),
        await vault.getAddress(),
        ethers.MaxUint256
      );

      await time.increase(7 * 24 * 60 * 60 + 1); // past Weekly interval

      // Pre-SV-19: this would have silently succeeded with no signature at
      // all, because sub.isContractVault was cached false. Post-SV-19: the
      // live recheck sees real deployed code and demands a valid ERC-1271
      // signature instead.
      await expect(
        vault.connect(keeper).executePull(id, 0, "0x")
      ).to.be.revertedWith("DeadlineExpired");

      // Now supply a real ERC-1271 signature — should succeed.
      const deadline = (await time.latest()) + 3600;
      const digest = await vault.pullAuthorisationDigest(id, deadline);
      const signature = signDigest(localWalletFor(4), digest);

      await expect(
        vault.connect(keeper).executePull(id, deadline, signature)
      ).to.emit(vault, "PaymentExecuted");
    });

    it("enforces maxAgentPullAmount retroactively for a misclassified subscription", async function () {
      // Default cap is 199 USDC (see constructor) and is a one-way-up ratchet
      // — no need to change it. Use an amount above the default cap instead.
      const overCapAmount = 250_000000n;

      const ConstructorSubscriber = await ethers.getContractFactory("ConstructorSubscriber");
      const bypassWallet = await ConstructorSubscriber.deploy(
        await vault.getAddress(),
        subscriber.address,
        merchant.address,
        await token.getAddress(),
        overCapAmount
      );
      await bypassWallet.waitForDeployment();

      await token.mint(await bypassWallet.getAddress(), overCapAmount * 2n);
      await bypassWallet.connect(subscriber).approveSpender(
        await token.getAddress(),
        await vault.getAddress(),
        ethers.MaxUint256
      );

      await time.increase(7 * 24 * 60 * 60 + 1);

      const deadline = (await time.latest()) + 3600;
      const id = 0n;
      const digest = await vault.pullAuthorisationDigest(id, deadline);
      const signature = signDigest(localWalletFor(4), digest);

      await expect(
        vault.connect(keeper).executePull(id, deadline, signature)
      ).to.be.revertedWith("AgentPullExceedsCap");
    });
  });

  // ===========================================================================
  // SV-20 — vault rotation (propose/accept)
  // ===========================================================================
  describe("SV-20: proposeSafeVaultChange / acceptSafeVaultChange", function () {
    it("moves the funding source only after the NEW vault itself accepts", async function () {
      await token.mint(subscriber.address, AMOUNT * 10n);
      await token.connect(subscriber).approve(await vault.getAddress(), AMOUNT * 10n);

      await vault.connect(subscriber).createSubscription(
        merchant.address,
        subscriber.address,
        await token.getAddress(),
        AMOUNT,
        0, 0,
        WEEKLY,
        ethers.ZeroAddress,
        0, 0,
        ethers.ZeroHash
      );
      const id = 0n;

      // Non-owner cannot propose.
      await expect(
        vault.connect(merchant).proposeSafeVaultChange(id, newVaultOwner.address)
      ).to.be.revertedWith("NotOwner");

      await expect(
        vault.connect(subscriber).proposeSafeVaultChange(id, newVaultOwner.address)
      ).to.emit(vault, "SafeVaultChangeProposed");

      // Wrong address cannot accept — proves the new vault must prove control itself.
      await expect(
        vault.connect(subscriber).acceptSafeVaultChange(id)
      ).to.be.revertedWith("NotPendingVault");

      // safeVault must NOT have moved yet — old vault still funds pulls.
      let sub = await vault.subscriptions(id);
      expect(sub.safeVault).to.equal(subscriber.address);

      await expect(
        vault.connect(newVaultOwner).acceptSafeVaultChange(id)
      ).to.emit(vault, "SafeVaultChangeAccepted");

      sub = await vault.subscriptions(id);
      expect(sub.safeVault).to.equal(newVaultOwner.address);
      expect(sub.pendingSafeVault).to.equal(ethers.ZeroAddress);

      // Old vault (subscriber) no longer funds pulls — new vault must be
      // funded/approved instead, or the pull falls into the grace-period path.
      await time.increase(7 * 24 * 60 * 60 + 1);
      await expect(
        vault.connect(keeper).executePull(id, 0, "0x")
      ).to.emit(vault, "InsufficientFunds"); // new vault has no balance yet — auto-pauses

      // `owner` (subscriber) is unaffected by the vault rotation — SV-20 keeps
      // owner fixed. Owner resumes after the insufficient-funds auto-pause.
      await vault.connect(subscriber).resumeSubscription(id);

      await token.mint(newVaultOwner.address, AMOUNT * 5n);
      await token.connect(newVaultOwner).approve(await vault.getAddress(), AMOUNT * 5n);

      await expect(
        vault.connect(keeper).executePull(id, 0, "0x")
      ).to.emit(vault, "PaymentExecuted");
    });

    it("allows the owner to cancel a pending rotation before it's accepted", async function () {
      await token.mint(subscriber.address, AMOUNT);
      await token.connect(subscriber).approve(await vault.getAddress(), AMOUNT);
      await vault.connect(subscriber).createSubscription(
        merchant.address, subscriber.address, await token.getAddress(),
        AMOUNT, 0, 0, WEEKLY, ethers.ZeroAddress, 0, 0, ethers.ZeroHash
      );
      const id = 0n;

      await vault.connect(subscriber).proposeSafeVaultChange(id, newVaultOwner.address);
      await expect(
        vault.connect(subscriber).cancelSafeVaultChange(id)
      ).to.emit(vault, "SafeVaultChangeCancelled");

      await expect(
        vault.connect(newVaultOwner).acceptSafeVaultChange(id)
      ).to.be.revertedWith("NoPendingChange");
    });

    it("no longer exposes updateSafeVault at all (removed, not just broken)", async function () {
      expect(vault.interface.hasFunction("updateSafeVault")).to.equal(false);
    });
  });
});
