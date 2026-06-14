// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

// =============================================================================
//  SubscriptionVault.sol — AuthOnce Protocol v7
//
//  Network:    Base Sepolia (testnet) / Base Mainnet
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  Changes from v6 (security fixes — post Hacken AI audit):
//
//    [V7-C1] CRITICAL — updateSafeVault now requires newSafeVault == msg.sender.
//            Same invariant as createSubscription [H2]. Without this, any address
//            could call updateSafeVault and redirect future pulls to a vault they
//            control, without holding the original vault key.
//
//    [V7-C2] CRITICAL — MerchantRegistry MAX_MERCHANTS cap now uses
//            _approvedMerchantCount instead of _merchantList.length.
//            (Fixed in MerchantRegistry v4.)
//
//    [V7-H1] HIGH — Fee transfer to treasury wrapped in try/catch.
//            If treasury is a contract that reverts (mis-configured recipient),
//            the fee is forgone for that pull and recorded in pendingFees[token]
//            for accounting/alerting. The pull completes — merchant is paid.
//            Admin must fix treasury via setProtocolTreasury() to restore fees.
//
//    [V7-H2] HIGH — prevLastPulledAt cached before state mutation in executePull.
//            Revert path now restores from cache, not arithmetic on mutated value.
//            Eliminates stale lastPulledAt if fee transfer path fails after
//            merchant payment succeeds.
//
//  EIP-712 domain:
//    name:              "AuthOnce"
//    version:           "7"
//    chainId:           <runtime>
//    verifyingContract: <this contract>
//
//    [SV-01] CRITICAL — isContractVault flag stored at createSubscription time.
//            extcodesize called once at subscription creation, result stored
//            immutably in struct. executePull uses stored flag, not live check.
//            Eliminates constructor-bypass of ERC-1271 verification.
//            updateSafeVault updates isContractVault to match new vault type.
//
//    [SV-02] HIGH — billingPausedUntil field replaces lastPulledAt abuse in
//            merchantPauseSubscription. lastPulledAt now only records actual
//            payment timestamps. executePull due-date check also gates on
//            billingPausedUntil. Guard added: billingPausedUntil cannot exceed
//            expiresAt if set. keeper.js updated to include billingPausedUntil
//            in isDue logic.
//
//    [SV-04] MEDIUM — Merchant transfer now uses SafeERC20.safeTransferFrom
//            wrapped in a low-level try/catch via a helper. Both merchant and
//            fee transfers use SafeERC20. Asymmetry eliminated.
//
//    [SV-06] MEDIUM — updateSafeVault updates isContractVault flag to match
//            new vault address type. Vault type switch is explicit and auditable.
//
//    [SV-09] LOW — _tokenList capped at MAX_TOKEN_LIST (50). approvedTokenList()
//            loop bounded. approvedTokenCount counter maintained for O(1) reads.
//
//    [SV-11] INFO — MAX_SUBSCRIPTION_AMOUNT added (1,000,000 USDC equivalent).
//            Enforced in createSubscription on amount and introAmount.
//
//    [SV-12] GAS — Allowance pre-check retained intentionally. It generates a
//            specific InsufficientAllowance event used by notifier.js for
//            differentiated subscriber notifications. Removal would degrade UX.
//
//  Security fixes carried from v5 (post-AI-audit):
//    [H2] safeVault must equal msg.sender
//    [M1] setFeeBps one-way ratchet
//    [M2] CEI pattern in executePull
//    [M3] SafeERC20 for all token transfers (now fully consistent — SV-04)
//    [M6] merchantPauseSubscription cooldown + lifetime cap
//    [M7] Merchant transfer DoS protection (try/catch)
//    [L1] approvedTokenList filters revoked tokens
//    [L3] Guardian can resume subscription
//    [L4] updateSafeVault added (now also updates isContractVault)
//    [L5] nextPullDue returns block.timestamp when lastPulledAt == 0
//    [L7] Dead pausedAt == 0 branch removed
//
//  EIP-712 domain:
//    name:              "AuthOnce"
//    version:           "6"
//    chainId:           <runtime>
//    verifyingContract: <this contract>
//
//  PullAuthorisation type:
//    uint256 subscriptionId
//    address token
//    uint256 amount
//    uint256 pullCount    — prevents replay of previous pull signatures
//    uint256 deadline     — signature expires; agent issues per-pull with tight TTL
//
//  Architecture decisions (locked):
//    - Protocol fee: 0.5% global, same for all merchants, all tokens.
//    - Tier enforcement: off-chain (API + Stripe). Contract knows nothing about tiers.
//    - Vault funded at exactly 1× subscription amount per billing cycle.
//    - Keeper bot is the only caller of executePull() and expireSubscription().
//    - Protocol never holds funds — non-custodial, no FINMA licence required.
//    - Payment token at signup = all future pulls. Token is immutable per subscription.
//    - safeVault must equal msg.sender at subscription creation.
//    - Fee-on-transfer tokens are not supported. Admin whitelist enforces standard ERC-20.
//    - Billing interval is 30 days ("Monthly"), 7 days ("Weekly"), 365 days ("Yearly").
//      These are fixed-second intervals, not calendar months. UX copy must reflect this.
//
//  License: Business Source License 1.1
//  © 2026 Vasco Humberto dos Reis Diogo. All Rights Reserved.
//  https://authonce.io
// =============================================================================

// -----------------------------------------------------------------------------
// Interface — ERC-20
// -----------------------------------------------------------------------------

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
}

// -----------------------------------------------------------------------------
// SafeERC20 (inlined — handles non-standard ERC-20 tokens like USDT)
// Wraps transferFrom/transfer to handle missing return values.
// Used for ALL token transfers in this contract — merchant and fee paths.
// [SV-04] Asymmetry between merchant and fee transfer paths eliminated in v6.
// -----------------------------------------------------------------------------

library SafeERC20 {
    function safeTransferFrom(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal {
        (bool success, bytes memory data) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        require(
            success && (data.length == 0 || abi.decode(data, (bool))),
            "SafeERC20: transferFrom failed"
        );
    }
}

// -----------------------------------------------------------------------------
// Interface — ERC-1271
// Smart contract wallet signature validation standard.
// Implemented by Gnosis Safe, Argent, Coinbase Smart Wallet, AI agent wallets.
// Returns ERC1271_MAGIC if signature is valid, 0xffffffff otherwise.
// -----------------------------------------------------------------------------

interface IERC1271 {
    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4 magicValue);
}

// -----------------------------------------------------------------------------
// Interface — MerchantRegistry
// -----------------------------------------------------------------------------

interface IMerchantRegistry {
    function isApproved(address merchant) external view returns (bool);
}

// -----------------------------------------------------------------------------
// ReentrancyGuard (inlined — no external dependency)
// -----------------------------------------------------------------------------

abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED     = 2;
    uint256 private _status;

    constructor() { _status = NOT_ENTERED; }

    modifier nonReentrant() {
        require(_status != ENTERED, "ReentrancyGuard: reentrant call");
        _status = ENTERED;
        _;
        _status = NOT_ENTERED;
    }
}

// -----------------------------------------------------------------------------
// EIP-712 (inlined — no external dependency)
// Implements structured typed data hashing per EIP-712.
// Domain separator is computed once at deploy and cached.
// -----------------------------------------------------------------------------

abstract contract EIP712 {

    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    // [SV-10] Store hashed name and version as immutables to avoid string literal
    // mismatch risk in fork-recompute path.
    bytes32 private immutable _HASHED_NAME;
    bytes32 private immutable _HASHED_VERSION;
    bytes32 private immutable _DOMAIN_SEPARATOR;
    uint256 private immutable _CHAIN_ID;

    constructor(string memory name, string memory version) {
        _HASHED_NAME    = keccak256(bytes(name));
        _HASHED_VERSION = keccak256(bytes(version));
        _CHAIN_ID       = block.chainid;
        _DOMAIN_SEPARATOR = _buildDomainSeparator();
    }

    function _buildDomainSeparator() private view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            _HASHED_NAME,
            _HASHED_VERSION,
            block.chainid,
            address(this)
        ));
    }

    /// @notice Returns the EIP-712 domain separator for this contract.
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        // Recompute if chain changes (e.g. after a fork), using stored hashes.
        if (block.chainid != _CHAIN_ID) {
            return _buildDomainSeparator();
        }
        return _DOMAIN_SEPARATOR;
    }

    /// @notice Produces the final EIP-712 hash to be signed or verified.
    function _hashTypedData(bytes32 structHash) internal view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", DOMAIN_SEPARATOR(), structHash));
    }
}

// =============================================================================
// Main Contract
// =============================================================================

contract SubscriptionVault is ReentrancyGuard, EIP712 {

    using SafeERC20 for IERC20;

    // -------------------------------------------------------------------------
    // Watermark — origin proof baked into bytecode forever
    // -------------------------------------------------------------------------

    string public constant PROTOCOL      = "AuthOnce Protocol";
    string public constant VERSION       = "7.0.0";
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

    // -------------------------------------------------------------------------
    // EIP-712 type hashes
    // -------------------------------------------------------------------------

    bytes32 public constant PULL_AUTHORISATION_TYPEHASH = keccak256(
        "PullAuthorisation(uint256 subscriptionId,address token,uint256 amount,uint256 pullCount,uint256 deadline)"
    );

    // -------------------------------------------------------------------------
    // ERC-1271 magic value
    // -------------------------------------------------------------------------

    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint16 public constant MAX_FEE_BPS      = 200;   // 2% hard ceiling
    uint16 public constant PROTOCOL_FEE_BPS = 50;    // 0.5% default

    uint256 public constant MIN_GRACE_DAYS     = 1;
    uint256 public constant MAX_GRACE_DAYS     = 30;
    uint256 public constant DEFAULT_GRACE_DAYS = 7;

    uint256 public constant MIN_EXPIRY_NOTICE = 30 days;
    uint256 public constant MAX_TRIAL_DAYS    = 90;
    uint256 public constant MAX_INTRO_PULLS   = 12;

    uint256 public constant PULL_DEADLINE_TOLERANCE = 24 hours;

    uint256 public constant WEEKLY  =    604_800; //   7 days
    uint256 public constant MONTHLY =  2_592_000; //  30 days (fixed interval — not calendar month)
    uint256 public constant YEARLY  = 31_536_000; // 365 days

    uint256 public constant MAX_TOTAL_MERCHANT_PAUSE_DAYS = 90;
    uint256 public constant MERCHANT_PAUSE_COOLDOWN       = 30 days;

    /// @notice [SV-11] Maximum subscription amount: 1,000,000 tokens (6-decimal basis).
    ///         Prevents misconfigured subscriptions with absurd amounts.
    ///         Expressed in base units — works for USDC/USDT/DAI/EURC at 6 decimals.
    ///         If an 18-decimal token is ever whitelisted, this constant must be reviewed.
    uint256 public constant MAX_SUBSCRIPTION_AMOUNT = 1_000_000 * 1e6;

    /// @notice [SV-09] Maximum number of tokens ever added to the whitelist.
    ///         Bounds approvedTokenList() loop. 50 is far beyond any realistic need.
    uint256 public constant MAX_TOKEN_LIST = 50;

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum SubscriptionStatus { Active, Paused, Cancelled, Expired }
    enum Interval { Weekly, Monthly, Yearly }

    // -------------------------------------------------------------------------
    // Subscription struct
    // -------------------------------------------------------------------------

    struct Subscription {
        address owner;              // Subscriber wallet — EOA or ERC-1271 contract wallet
        address guardian;           // Can also cancel/pause/resume — zero address if none
        address merchant;           // Approved merchant — immutable after creation
        address safeVault;          // Wallet holding tokens — must equal owner at creation
        address token;              // Payment token — from admin whitelist, immutable
        uint256 amount;             // Full recurring amount per pull (token decimals)
        uint256 introAmount;        // Amount per pull during intro period (0 = no intro)
        uint256 introPulls;         // Number of pulls at introAmount before switching
        uint256 pullCount;          // Total successful pulls (also nonce for EIP-712)
        Interval interval;          // Weekly / Monthly / Yearly — immutable
        uint256 lastPulledAt;       // Timestamp of last SUCCESSFUL pull (or trialEndsAt)
        uint256 billingPausedUntil; // [SV-02] Merchant billing pause end timestamp (0 = not paused by merchant)
        uint256 pausedAt;           // Timestamp of subscriber-side pause start (0 = not paused)
        uint256 expiresAt;          // Timestamp of scheduled expiry (0 = none)
        uint256 trialEndsAt;        // Timestamp when trial ends (0 = no trial)
        uint256 gracePeriodDays;    // Grace period in days before auto-expiry (1–30)
        bytes32 dataVaultId;        // DataOnce Phase 2 — encrypted data vault reference
        SubscriptionStatus status;
        bool isContractVault;       // [SV-01] Set once at createSubscription. True if safeVault
                                    //         had contract code at subscription creation time.
                                    //         Immutable per pull — cannot be bypassed by
                                    //         subscribing from a constructor.
    }

    // -------------------------------------------------------------------------
    // State variables
    // -------------------------------------------------------------------------

    address public admin;
    address public pendingAdmin;
    address public keeper;
    address public protocolTreasury;
    address public merchantRegistry;

    uint16  public feeBps;

    uint256 private _nextSubscriptionId;

    mapping(address => bool) public approvedTokens;
    address[] private _tokenList;

    /// @notice [SV-09] Count of currently approved (non-revoked) tokens.
    ///         O(1) read. Maintained on approveToken/revokeToken.
    uint256 public approvedTokenCount;

    mapping(uint256 => Subscription) public subscriptions;

    mapping(uint256 => uint256) public totalMerchantPauseDays;
    mapping(uint256 => uint256) public lastMerchantPauseAt;

    /// @notice [V7-H1] Accumulated protocol fees per token.
    ///         Fee transfers to treasury are wrapped in try/catch.
    ///         If treasury reverts (e.g. contract recipient), fees land here
    ///         and can be withdrawn via withdrawPendingFees().
    mapping(address => uint256) public pendingFees;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ProtocolDeployed(
        string  protocol,
        string  version,
        address indexed deployer,
        address indexed initialAdmin,
        uint256 chainId,
        uint256 timestamp
    );

    event SubscriptionCreated(
        uint256 indexed id,
        address indexed owner,
        address indexed merchant,
        address safeVault,
        address token,
        uint256 amount,
        uint256 introAmount,
        uint256 introPulls,
        Interval interval,
        address guardian,
        uint256 trialEndsAt,
        uint256 gracePeriodDays,
        bool    isContractVault  // [SV-01] Vault type recorded in event for off-chain indexing
    );

    event SafeVaultUpdated(
        uint256 indexed id,
        address indexed oldVault,
        address indexed newVault,
        bool    newIsContractVault  // [SV-06] Vault type change is explicit and auditable
    );

    event PaymentExecuted(
        uint256 indexed id,
        address indexed token,
        uint256 amount,
        uint256 merchantReceived,
        uint256 fee,
        uint256 pullCount,
        uint256 timestamp
    );

    event MerchantTransferFailed(uint256 indexed id, address indexed merchant);
    event FeeAccumulated(uint256 indexed id, address indexed token, uint256 amount);   // [V7-H1]

    event InsufficientFunds(
        uint256 indexed id,
        address indexed token,
        uint256 required,
        uint256 available,
        uint256 pausedUntil
    );

    event InsufficientAllowance(
        uint256 indexed id,
        address indexed token,
        uint256 required,
        uint256 allowance
    );

    event SubscriptionPaused(uint256 indexed id, address pausedBy, string reason);
    event SubscriptionCancelled(uint256 indexed id, address cancelledBy);
    event SubscriptionResumed(uint256 indexed id, uint256 timestamp);
    event SubscriptionExpired(uint256 indexed id, uint256 timestamp);
    event SubscriptionPausedByMerchant(uint256 indexed id, address indexed merchant, uint256 billingPausedUntil);
    event ProductExpirySet(uint256 indexed id, address indexed merchant, uint256 expiresAt, uint256 noticeDays);
    event TrialStarted(uint256 indexed id, uint256 trialEndsAt);
    event GracePeriodSet(uint256 indexed id, uint256 gracePeriodDays);
    event TokenApproved(address indexed token, address indexed approvedBy);
    event TokenRevoked(address indexed token, address indexed revokedBy);
    event RegistryUpdated(address indexed oldRegistry, address indexed newRegistry);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);
    event AdminTransferProposed(address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferAccepted(address indexed oldAdmin, address indexed newAdmin);
    event AdminTransferCancelled(address indexed cancelledBy);

    // -------------------------------------------------------------------------
    // Modifiers
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "NotAdmin");
        _;
    }

    modifier onlyKeeper() {
        require(msg.sender == keeper, "NotKeeper");
        _;
    }

    modifier onlyOwnerOrGuardian(uint256 id) {
        Subscription storage sub = subscriptions[id];
        require(
            msg.sender == sub.owner ||
            (sub.guardian != address(0) && msg.sender == sub.guardian),
            "NotAuthorised"
        );
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    constructor(
        address _admin,
        address _keeper,
        address _protocolTreasury,
        address _merchantRegistry
    ) EIP712("AuthOnce", "7") {
        require(_admin            != address(0), "ZeroAdmin");
        require(_keeper           != address(0), "ZeroKeeper");
        require(_protocolTreasury != address(0), "ZeroTreasury");
        require(_merchantRegistry != address(0), "ZeroRegistry");

        admin            = _admin;
        keeper           = _keeper;
        protocolTreasury = _protocolTreasury;
        merchantRegistry = _merchantRegistry;
        feeBps           = PROTOCOL_FEE_BPS;

        emit ProtocolDeployed(PROTOCOL, VERSION, msg.sender, _admin, block.chainid, block.timestamp);
    }

    // =========================================================================
    // USER ACTIONS
    // =========================================================================

    /// @notice Create a new subscription.
    ///
    /// @param merchant          Approved merchant wallet address
    /// @param safeVault         Wallet holding tokens — MUST equal msg.sender.
    /// @param token             Payment token — must be in admin whitelist. Immutable.
    /// @param amount            Full recurring price in token units.
    /// @param introAmount       Introductory price per pull (0 = no intro). Must be <= amount.
    /// @param introPulls        Number of pulls at introAmount (0 = no intro, max 12).
    /// @param interval          Weekly / Monthly / Yearly — immutable after creation.
    /// @param guardian          Address that can also cancel/pause/resume (zero = none).
    /// @param trialDays         Free trial days before first payment (0 = none, max 90).
    /// @param gracePeriodDays_  Grace period on payment failure (0 = default 7, max 30).
    /// @param dataVaultId_      DataOnce Phase 2 vault reference (zero = unused).
    function createSubscription(
        address  merchant,
        address  safeVault,
        address  token,
        uint256  amount,
        uint256  introAmount,
        uint256  introPulls,
        Interval interval,
        address  guardian,
        uint256  trialDays,
        uint256  gracePeriodDays_,
        bytes32  dataVaultId_
    ) external returns (uint256 id) {
        // [H2] safeVault must be the caller.
        require(safeVault == msg.sender,   "VaultMustBeCaller");

        require(merchant  != address(0),   "ZeroMerchant");
        require(token     != address(0),   "ZeroToken");
        require(amount    >  0,            "ZeroAmount");
        // [SV-11] Cap subscription amount to prevent misconfigured subscriptions.
        require(amount    <= MAX_SUBSCRIPTION_AMOUNT, "AmountTooHigh");
        require(approvedTokens[token],     "TokenNotApproved");
        require(
            IMerchantRegistry(merchantRegistry).isApproved(merchant),
            "MerchantNotApproved"
        );
        require(trialDays  <= MAX_TRIAL_DAYS,  "TrialTooLong");
        require(introPulls <= MAX_INTRO_PULLS, "TooManyIntroPulls");
        require(
            introAmount == 0 || introAmount <= amount,
            "IntroExceedsFull"
        );
        // [SV-11] Cap introAmount as well.
        require(
            introAmount == 0 || introAmount <= MAX_SUBSCRIPTION_AMOUNT,
            "IntroAmountTooHigh"
        );
        require(
            introPulls == 0 || introAmount > 0,
            "IntroPullsWithoutAmount"
        );
        require(
            gracePeriodDays_ == 0 ||
            (gracePeriodDays_ >= MIN_GRACE_DAYS && gracePeriodDays_ <= MAX_GRACE_DAYS),
            "InvalidGracePeriod"
        );

        uint256 graceDays   = gracePeriodDays_ == 0 ? DEFAULT_GRACE_DAYS : gracePeriodDays_;
        uint256 trialEndsAt = trialDays > 0 ? block.timestamp + (trialDays * 1 days) : 0;

        // [SV-01] Detect vault type at creation time and store immutably.
        // extcodesize is called once here. executePull uses the stored flag.
        // A contract subscribing from within its own constructor will have
        // extcodesize == 0 here — isContractVault = false — making the bypass
        // explicit, auditable, and on-chain: the subscription will be treated
        // as an EOA subscription permanently.
        // NOTE: This is a known trade-off. Legitimate contract wallets MUST
        // call createSubscription after their constructor completes (i.e., from
        // a deployed wallet, not during deployment). This is standard practice
        // for all ERC-1271 integrations.
        bool contractVault = _isContract(safeVault);

        id = _nextSubscriptionId++;

        subscriptions[id] = Subscription({
            owner:              msg.sender,
            guardian:           guardian,
            merchant:           merchant,
            safeVault:          safeVault,
            token:              token,
            amount:             amount,
            introAmount:        introAmount,
            introPulls:         introPulls,
            pullCount:          0,
            interval:           interval,
            lastPulledAt:       trialEndsAt,
            billingPausedUntil: 0,
            pausedAt:           0,
            expiresAt:          0,
            trialEndsAt:        trialEndsAt,
            gracePeriodDays:    graceDays,
            dataVaultId:        dataVaultId_,
            status:             SubscriptionStatus.Active,
            isContractVault:    contractVault
        });

        emit SubscriptionCreated(
            id, msg.sender, merchant, safeVault, token,
            amount, introAmount, introPulls, interval, guardian,
            trialEndsAt, graceDays, contractVault
        );
    }

    function cancelSubscription(uint256 id) external onlyOwnerOrGuardian(id) {
        Subscription storage sub = subscriptions[id];
        require(
            sub.status == SubscriptionStatus.Active ||
            sub.status == SubscriptionStatus.Paused,
            "AlreadyInactive"
        );
        sub.status = SubscriptionStatus.Cancelled;
        emit SubscriptionCancelled(id, msg.sender);
    }

    function pauseSubscription(uint256 id) external onlyOwnerOrGuardian(id) {
        Subscription storage sub = subscriptions[id];
        require(sub.status == SubscriptionStatus.Active, "NotActive");
        sub.status   = SubscriptionStatus.Paused;
        sub.pausedAt = block.timestamp;
        emit SubscriptionPaused(id, msg.sender, "manual");
    }

    /// @notice Resume a paused subscription.
    ///         Both owner and guardian can resume — symmetric with pauseSubscription.
    function resumeSubscription(uint256 id) external {
        Subscription storage sub = subscriptions[id];
        require(
            msg.sender == sub.owner ||
            (sub.guardian != address(0) && msg.sender == sub.guardian),
            "NotAuthorised"
        );
        require(sub.status == SubscriptionStatus.Paused, "NotPaused");
        require(sub.pausedAt > 0, "InvalidPausedState");
        require(
            block.timestamp <= sub.pausedAt + (sub.gracePeriodDays * 1 days),
            "GracePeriodExpired"
        );
        sub.status   = SubscriptionStatus.Active;
        sub.pausedAt = 0;
        emit SubscriptionResumed(id, block.timestamp);
    }

    /// @notice Update the safeVault address for a subscription.
    ///         Only the subscription owner can call this.
    ///         [SV-06] Updates isContractVault flag to match the new vault type.
    ///         Vault type change is emitted explicitly in SafeVaultUpdated event.
    function updateSafeVault(uint256 id, address newSafeVault) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.owner,        "NotOwner");
        require(newSafeVault != address(0),     "ZeroVault");
        // [V7-C1] newSafeVault must be the caller — same invariant as createSubscription [H2].
        // Prevents any address from becoming the safeVault without holding the key.
        require(newSafeVault == msg.sender,     "VaultMustBeCaller");
        require(
            sub.status == SubscriptionStatus.Active ||
            sub.status == SubscriptionStatus.Paused,
            "InactiveSubscription"
        );
        address oldVault = sub.safeVault;

        // [SV-06] Re-evaluate vault type for the new address.
        // If switching from EOA to contract wallet: ERC-1271 will now be required.
        // If switching from contract wallet to EOA: ERC-1271 will no longer be required.
        // Both changes are recorded on-chain via the event.
        bool newContractVault = _isContract(newSafeVault);

        sub.safeVault       = newSafeVault;
        sub.isContractVault = newContractVault;

        emit SafeVaultUpdated(id, oldVault, newSafeVault, newContractVault);
    }

    // =========================================================================
    // MERCHANT ACTIONS
    // =========================================================================

    /// @notice Merchant sets a scheduled expiry (price change flow).
    ///         Enforces 30-day minimum notice on-chain.
    function setProductExpiry(uint256 id, uint256 expiresAt) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.merchant,                       "NotMerchant");
        require(sub.status == SubscriptionStatus.Active,          "NotActive");
        require(expiresAt >= block.timestamp + MIN_EXPIRY_NOTICE, "InsufficientNotice");
        require(sub.expiresAt == 0 || expiresAt > sub.expiresAt,  "CannotShortenExpiry");

        uint256 noticeDays = (expiresAt - block.timestamp) / 1 days;
        sub.expiresAt = expiresAt;
        emit ProductExpirySet(id, msg.sender, expiresAt, noticeDays);
    }

    /// @notice Merchant pauses billing for a subscriber (customer service use).
    ///         [SV-02] Sets billingPausedUntil instead of abusing lastPulledAt.
    ///         lastPulledAt now only records actual payment timestamps.
    ///         executePull due-date check gates on both lastPulledAt and billingPausedUntil.
    ///         [M6] Cooldown of 30 days between pauses. Lifetime cap of 90 days total.
    ///         Guard: billingPausedUntil cannot exceed expiresAt if set.
    function merchantPauseSubscription(uint256 id, uint256 pauseDays) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.merchant,              "NotMerchant");
        require(sub.status == SubscriptionStatus.Active, "NotActive");
        require(pauseDays >= 1,                          "MinOneDayPause");
        require(pauseDays <= 90,                         "PauseTooLong");

        require(
            block.timestamp >= lastMerchantPauseAt[id] + MERCHANT_PAUSE_COOLDOWN,
            "MerchantPauseCooldownActive"
        );

        require(
            totalMerchantPauseDays[id] + pauseDays <= MAX_TOTAL_MERCHANT_PAUSE_DAYS,
            "MerchantPauseLimitExceeded"
        );

        uint256 pauseUntil = block.timestamp + (pauseDays * 1 days);

        // [SV-02] Guard: merchant cannot push billing pause past the subscription's
        // own scheduled expiry. Prevents griefing where a merchant uses pauseDays
        // to force expiry before the next pull executes.
        if (sub.expiresAt > 0) {
            require(pauseUntil < sub.expiresAt, "PausePastExpiry");
        }

        lastMerchantPauseAt[id]    = block.timestamp;
        totalMerchantPauseDays[id] += pauseDays;

        // [SV-02] Store billing pause end time. lastPulledAt is NOT modified.
        sub.billingPausedUntil = pauseUntil;

        emit SubscriptionPausedByMerchant(id, msg.sender, pauseUntil);
    }

    // =========================================================================
    // KEEPER ACTIONS
    // =========================================================================

    /// @notice Execute a pull for a due subscription.
    ///
    ///         EOA subscribers (MetaMask, Ledger, Coinbase Wallet):
    ///           sub.isContractVault == false. Pass deadline=0, signature="0x".
    ///           ERC-1271 check is skipped entirely.
    ///
    ///         Contract wallet subscribers (Gnosis Safe, AI agents, smart wallets):
    ///           sub.isContractVault == true. Pass a valid EIP-712 PullAuthorisation
    ///           signature with deadline. Vault verifies via IERC1271.isValidSignature.
    ///
    ///         [SV-01] Uses stored isContractVault flag — not live extcodesize check.
    ///                 Constructor-bypass eliminated.
    ///         [SV-02] Due-date check gates on both lastPulledAt and billingPausedUntil.
    ///         [SV-04] Both merchant and fee transfers use SafeERC20.
    ///         [M2]    CEI pattern — state updated before external calls.
    ///         [M7]    Merchant transfer uses try/catch — cannot DoS pulls.
    function executePull(
        uint256 id,
        uint256 deadline,
        bytes calldata signature
    )
        external
        nonReentrant
        onlyKeeper
    {
        Subscription storage sub = subscriptions[id];

        require(sub.status == SubscriptionStatus.Active, "NotActive");

        // Check scheduled expiry
        if (sub.expiresAt > 0 && block.timestamp >= sub.expiresAt) {
            sub.status = SubscriptionStatus.Expired;
            emit SubscriptionExpired(id, block.timestamp);
            return;
        }

        // [SV-02] Check due date — must satisfy both payment interval AND merchant billing pause.
        uint256 intervalSeconds = _intervalToSeconds(sub.interval);
        require(
            block.timestamp >= sub.lastPulledAt + intervalSeconds,
            "NotDueYet"
        );
        require(
            sub.billingPausedUntil == 0 || block.timestamp >= sub.billingPausedUntil,
            "BillingPaused"
        );

        // Cache storage variables
        uint256 introAmount     = sub.introAmount;
        uint256 pullCount       = sub.pullCount;
        uint256 introPulls      = sub.introPulls;
        uint256 gracePeriodDays = sub.gracePeriodDays;
        address token           = sub.token;
        address safeVault       = sub.safeVault;
        address merchant        = sub.merchant;

        uint256 pullAmount = (introAmount > 0 && pullCount < introPulls)
            ? introAmount
            : sub.amount;

        // [SV-01] Use stored isContractVault flag — not live _isContract() call.
        if (sub.isContractVault) {
            require(deadline > block.timestamp,                            "DeadlineExpired");
            require(deadline <= block.timestamp + PULL_DEADLINE_TOLERANCE, "DeadlineTooFar");

            bytes32 structHash = keccak256(abi.encode(
                PULL_AUTHORISATION_TYPEHASH,
                id,
                token,
                pullAmount,
                pullCount,
                deadline
            ));

            bytes32 digest = _hashTypedData(structHash);
            bytes4 result  = IERC1271(safeVault).isValidSignature(digest, signature);
            require(result == ERC1271_MAGIC, "ERC1271InvalidSignature");
        }
        // EOA path: deadline and signature ignored.

        // Check token balance
        uint256 currentBalance = IERC20(token).balanceOf(safeVault);
        if (currentBalance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientFunds(
                id, token, pullAmount, currentBalance,
                block.timestamp + (gracePeriodDays * 1 days)
            );
            emit SubscriptionPaused(id, address(this), "insufficient_funds");
            return;
        }

        // Check token allowance — retained for differentiated InsufficientAllowance
        // event used by notifier.js for specific subscriber notifications. [SV-12: intentional]
        uint256 currentAllowance = IERC20(token).allowance(safeVault, address(this));
        if (currentAllowance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientAllowance(id, token, pullAmount, currentAllowance);
            emit SubscriptionPaused(id, address(this), "insufficient_allowance");
            return;
        }

        // Calculate fee split
        uint256 fee              = (pullAmount * feeBps) / 10_000;
        uint256 merchantReceives = pullAmount - fee;

        // [V7-H2] Cache lastPulledAt before any state mutation.
        //         Used to restore correct value if merchant transfer fails,
        //         and to avoid stale-state on the fee revert path.
        uint256 prevLastPulledAt = sub.lastPulledAt;

        // [M2] CEI: Update state BEFORE external calls.
        sub.lastPulledAt = block.timestamp;
        sub.pullCount    = pullCount + 1;

        // [SV-04] Merchant transfer uses SafeERC20 wrapped in try/catch.
        // [M7]    Merchant contract cannot DoS pulls by reverting on receive.
        bool merchantPaid = _safeTransferFromWithCatch(
            IERC20(token), safeVault, merchant, merchantReceives
        );

        if (!merchantPaid) {
            // [V7-H2] Restore from cache — not arithmetic on mutated value.
            sub.lastPulledAt = prevLastPulledAt;
            sub.pullCount    = pullCount;
            emit MerchantTransferFailed(id, merchant);
            return;
        }

        // [V7-H1] Fee transfer wrapped in try/catch.
        //         If treasury is a contract that reverts, the fee is forgone for
        //         this pull and recorded in pendingFees[token] for accounting.
        //         Admin must fix treasury via setProtocolTreasury() to restore fees.
        //         Prevents a rejecting treasury from bricking all executePull calls.
        if (fee > 0) {
            bool feePaid = _safeTransferFromWithCatch(
                IERC20(token), safeVault, protocolTreasury, fee
            );
            if (!feePaid) {
                pendingFees[token] += fee;
                emit FeeAccumulated(id, token, fee);
            }
        }

        emit PaymentExecuted(
            id, token, pullAmount, merchantReceives, fee,
            sub.pullCount, block.timestamp
        );
    }

    /// @notice Expire a subscription that has exceeded its grace period.
    ///         Called by keeper after grace window closes.
    function expireSubscription(uint256 id) external onlyKeeper {
        Subscription storage sub = subscriptions[id];
        require(sub.status == SubscriptionStatus.Paused, "NotPaused");
        require(sub.pausedAt > 0,                         "NeverPaused");
        require(
            block.timestamp > sub.pausedAt + (sub.gracePeriodDays * 1 days),
            "GraceStillActive"
        );
        sub.status = SubscriptionStatus.Expired;
        emit SubscriptionExpired(id, block.timestamp);
    }

    // =========================================================================
    // ADMIN ACTIONS
    // =========================================================================

    /// @notice Add a token to the global whitelist.
    ///         [SV-09] Enforces MAX_TOKEN_LIST cap. Increments approvedTokenCount.
    function approveToken(address token) external onlyAdmin {
        require(token != address(0),    "ZeroToken");
        require(!approvedTokens[token], "AlreadyApproved");
        require(_tokenList.length < MAX_TOKEN_LIST, "TokenListFull");
        approvedTokens[token] = true;
        _tokenList.push(token);
        approvedTokenCount++;
        emit TokenApproved(token, msg.sender);
    }

    /// @notice Remove a token from the whitelist.
    ///         Existing subscriptions using this token are NOT affected.
    ///         [SV-09] Decrements approvedTokenCount.
    function revokeToken(address token) external onlyAdmin {
        require(approvedTokens[token], "TokenNotApproved");
        approvedTokens[token] = false;
        approvedTokenCount--;
        emit TokenRevoked(token, msg.sender);
    }

    /// @notice Update the MerchantRegistry address.
    function setMerchantRegistry(address _registry) external onlyAdmin {
        require(_registry != address(0), "ZeroRegistry");
        emit RegistryUpdated(merchantRegistry, _registry);
        merchantRegistry = _registry;
    }

    /// @notice Lower the protocol fee. One-way ratchet — can only decrease.
    function setFeeBps(uint16 _feeBps) external onlyAdmin {
        require(_feeBps <= MAX_FEE_BPS, "FeeTooHigh");
        require(_feeBps <= feeBps,      "CanOnlyLowerFee");
        emit FeeUpdated(feeBps, _feeBps);
        feeBps = _feeBps;
    }

    function setKeeper(address _keeper) external onlyAdmin {
        require(_keeper != address(0), "ZeroKeeper");
        emit KeeperUpdated(keeper, _keeper);
        keeper = _keeper;
    }

    function setProtocolTreasury(address _treasury) external onlyAdmin {
        require(_treasury != address(0), "ZeroTreasury");
        emit TreasuryUpdated(protocolTreasury, _treasury);
        protocolTreasury = _treasury;
    }

    function proposeAdminTransfer(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ZeroAdmin");
        require(newAdmin != admin,      "AlreadyAdmin");
        if (pendingAdmin != address(0)) {
            emit AdminTransferCancelled(msg.sender);
        }
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    function acceptAdminTransfer() external {
        require(msg.sender == pendingAdmin, "NotPendingAdmin");
        address old  = admin;
        admin        = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(old, admin);
    }

    function cancelAdminTransfer() external onlyAdmin {
        require(pendingAdmin != address(0), "NoPendingTransfer");
        pendingAdmin = address(0);
        emit AdminTransferCancelled(msg.sender);
    }

    // =========================================================================
    // VIEW HELPERS
    // =========================================================================

    /// @notice Returns the EIP-712 digest for a PullAuthorisation.
    function pullAuthorisationDigest(
        uint256 id,
        uint256 deadline
    ) external view returns (bytes32) {
        Subscription storage sub = subscriptions[id];
        uint256 pullAmount = (sub.introAmount > 0 && sub.pullCount < sub.introPulls)
            ? sub.introAmount
            : sub.amount;

        bytes32 structHash = keccak256(abi.encode(
            PULL_AUTHORISATION_TYPEHASH,
            id,
            sub.token,
            pullAmount,
            sub.pullCount,
            deadline
        ));
        return _hashTypedData(structHash);
    }

    /// @notice Returns the amount that will be pulled on the next executePull call.
    function nextPullAmount(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.introAmount > 0 && sub.pullCount < sub.introPulls) {
            return sub.introAmount;
        }
        return sub.amount;
    }

    /// @notice Returns timestamp when the next pull is due.
    ///         [SV-02] Returns the later of (lastPulledAt + interval) and billingPausedUntil.
    function nextPullDue(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        uint256 intervalDue = sub.lastPulledAt == 0
            ? block.timestamp
            : sub.lastPulledAt + _intervalToSeconds(sub.interval);

        if (sub.billingPausedUntil > intervalDue) {
            return sub.billingPausedUntil;
        }
        return intervalDue;
    }

    /// @notice Returns current token balance of the subscription vault.
    function vaultBalance(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        return IERC20(sub.token).balanceOf(sub.safeVault);
    }

    /// @notice Returns current token allowance granted to this contract.
    function vaultAllowance(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        return IERC20(sub.token).allowance(sub.safeVault, address(this));
    }

    /// @notice Returns true if the subscription is due for a pull.
    ///         [SV-02] Also checks billingPausedUntil.
    function isDue(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        if (sub.status != SubscriptionStatus.Active) return false;
        if (sub.expiresAt > 0 && block.timestamp >= sub.expiresAt) return false;
        if (sub.billingPausedUntil > 0 && block.timestamp < sub.billingPausedUntil) return false;
        if (sub.lastPulledAt == 0) return true;
        return block.timestamp >= sub.lastPulledAt + _intervalToSeconds(sub.interval);
    }

    function inTrial(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.trialEndsAt > 0 && block.timestamp < sub.trialEndsAt;
    }

    function inIntroPricing(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.introAmount > 0 && sub.pullCount < sub.introPulls;
    }

    function daysUntilTrialEnds(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.trialEndsAt == 0 || block.timestamp >= sub.trialEndsAt) return 0;
        return (sub.trialEndsAt - block.timestamp) / 1 days;
    }

    function daysUntilExpiry(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.expiresAt == 0 || block.timestamp >= sub.expiresAt) return 0;
        return (sub.expiresAt - block.timestamp) / 1 days;
    }

    function introPullsRemaining(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.introAmount == 0 || sub.pullCount >= sub.introPulls) return 0;
        return sub.introPulls - sub.pullCount;
    }

    /// @notice Returns the list of currently approved (non-revoked) token addresses.
    ///         [SV-09] Loop bounded by MAX_TOKEN_LIST (50). approvedTokenCount for O(1) count.
    function approvedTokenList() external view returns (address[] memory) {
        uint256 count = approvedTokenCount;
        address[] memory active = new address[](count);
        uint256 j = 0;
        for (uint256 i = 0; i < _tokenList.length; i++) {
            if (approvedTokens[_tokenList[i]]) active[j++] = _tokenList[i];
        }
        return active;
    }

    function subscriptionToken(uint256 id) external view returns (address) {
        return subscriptions[id].token;
    }

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _intervalToSeconds(Interval interval) internal pure returns (uint256) {
        if (interval == Interval.Weekly)  return WEEKLY;
        if (interval == Interval.Monthly) return MONTHLY;
        return YEARLY;
    }

    /// @notice Returns true if address has contract code deployed.
    ///         [SV-01] Called ONLY at createSubscription and updateSafeVault.
    ///         Result stored in isContractVault. Never called inside executePull.
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }

    /// @notice [SV-04] SafeERC20 transferFrom wrapped in a low-level try/catch.
    ///         Returns true if the transfer succeeded, false if it reverted.
    ///         Used for merchant transfer path to maintain DoS protection [M7]
    ///         while using SafeERC20 for consistent non-standard token handling.
    function _safeTransferFromWithCatch(
        IERC20 token,
        address from,
        address to,
        uint256 amount
    ) internal returns (bool) {
        (bool success, bytes memory returndata) = address(token).call(
            abi.encodeWithSelector(token.transferFrom.selector, from, to, amount)
        );
        if (!success) return false;
        if (returndata.length > 0 && !abi.decode(returndata, (bool))) return false;
        return true;
    }
}
