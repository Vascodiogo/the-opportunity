// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// =============================================================================
//  SubscriptionVault.sol — AuthOnce Protocol v5
//
//  Network:    Base Sepolia (testnet) / Base Mainnet
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  Changes from v4:
//    - Multi-token: hardcoded USDC replaced with admin-controlled token
//      whitelist. Each subscription specifies its payment token at creation.
//    - EIP-712: structured typed data hashing for all pull authorisations.
//      Human-readable in wallet UIs. Compatible with AI agent frameworks
//      (LangChain, Brian, Coinbase AgentKit) and every serious ERC-1271 wallet.
//    - ERC-1271: smart contract wallets and AI agent wallets can subscribe.
//      EOAs are unaffected — no gas overhead for normal subscribers.
//    - DataOnce: dataVaultId field on Subscription struct (Phase 2 placeholder).
//    - External MerchantRegistry: merchant approval delegated to IMerchantRegistry.
//      Registry address set at deploy, updatable by admin.
//    - Protocol fee: 0.5% global constant. Same for all merchants, all tokens.
//      Admin can only lower it, never raise above MAX_FEE_BPS (2%).
//
//  EIP-712 domain:
//    name:              "AuthOnce"
//    version:           "5"
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
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function decimals() external view returns (uint8);
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

    // EIP-712 domain typehash
    bytes32 private constant DOMAIN_TYPEHASH = keccak256(
        "EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"
    );

    bytes32 private immutable _DOMAIN_SEPARATOR;
    uint256 private immutable _CHAIN_ID;

    constructor(string memory name, string memory version) {
        _CHAIN_ID = block.chainid;
        _DOMAIN_SEPARATOR = _buildDomainSeparator(name, version);
    }

    function _buildDomainSeparator(
        string memory name,
        string memory version
    ) private view returns (bytes32) {
        return keccak256(abi.encode(
            DOMAIN_TYPEHASH,
            keccak256(bytes(name)),
            keccak256(bytes(version)),
            block.chainid,
            address(this)
        ));
    }

    /// @notice Returns the EIP-712 domain separator for this contract.
    function DOMAIN_SEPARATOR() public view returns (bytes32) {
        // Recompute if chain changes (e.g. after a fork), otherwise use cache.
        if (block.chainid != _CHAIN_ID) {
            return _buildDomainSeparator("AuthOnce", "5");
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

    // -------------------------------------------------------------------------
    // Watermark — origin proof baked into bytecode forever
    // -------------------------------------------------------------------------

    string public constant PROTOCOL      = "AuthOnce Protocol";
    string public constant VERSION       = "5.0.0";
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

    // -------------------------------------------------------------------------
    // EIP-712 type hashes
    // -------------------------------------------------------------------------

    /// @notice Typehash for PullAuthorisation.
    /// Struct definition (human-readable, shown in wallet UIs):
    ///   PullAuthorisation(
    ///     uint256 subscriptionId,
    ///     address token,
    ///     uint256 amount,
    ///     uint256 pullCount,
    ///     uint256 deadline
    ///   )
    ///
    /// subscriptionId — identifies which subscription this pull is for
    /// token          — payment token address (cross-checks sub.token)
    /// amount         — exact amount being pulled (cross-checks pullAmount)
    /// pullCount      — pull sequence number (prevents replaying old signatures)
    /// deadline       — unix timestamp after which signature is invalid
    bytes32 public constant PULL_AUTHORISATION_TYPEHASH = keccak256(
        "PullAuthorisation(uint256 subscriptionId,address token,uint256 amount,uint256 pullCount,uint256 deadline)"
    );

    // -------------------------------------------------------------------------
    // ERC-1271 magic value
    // -------------------------------------------------------------------------

    bytes4 internal constant ERC1271_MAGIC = bytes4(keccak256("isValidSignature(bytes32,bytes)"));

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice Hard ceiling on protocol fee: 2% = 200 bps. Never raiseable above this.
    uint16 public constant MAX_FEE_BPS = 200;

    /// @notice Default protocol fee: 0.5% = 50 bps. Same for all merchants, all tokens.
    uint16 public constant PROTOCOL_FEE_BPS = 50;

    uint256 public constant MIN_GRACE_DAYS     = 1;
    uint256 public constant MAX_GRACE_DAYS     = 30;
    uint256 public constant DEFAULT_GRACE_DAYS = 7;

    /// @notice Minimum notice period for merchant price changes — 30 days.
    uint256 public constant MIN_EXPIRY_NOTICE = 30 days;

    /// @notice Maximum trial period — 90 days.
    uint256 public constant MAX_TRIAL_DAYS = 90;

    /// @notice Maximum introductory pulls — 12 (e.g. 12 months at intro price).
    uint256 public constant MAX_INTRO_PULLS = 12;

    /// @notice ERC-1271 pull deadline tolerance — keeper must execute within
    ///         24 hours of generating the pull signature. Tight TTL by design.
    uint256 public constant PULL_DEADLINE_TOLERANCE = 24 hours;

    uint256 public constant WEEKLY  =    604_800; //   7 days
    uint256 public constant MONTHLY =  2_592_000; //  30 days
    uint256 public constant YEARLY  = 31_536_000; // 365 days

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum SubscriptionStatus { Active, Paused, Cancelled, Expired }
    enum Interval { Weekly, Monthly, Yearly }

    // -------------------------------------------------------------------------
    // Subscription struct
    // -------------------------------------------------------------------------

    struct Subscription {
        address owner;           // Subscriber wallet — EOA or ERC-1271 contract wallet
        address guardian;        // Can also cancel/pause — zero address if none
        address merchant;        // Approved merchant — immutable after creation
        address safeVault;       // Wallet holding tokens (= owner for EOAs)
        address token;           // Payment token — from admin whitelist, immutable
        uint256 amount;          // Full recurring amount per pull (token decimals)
        uint256 introAmount;     // Amount per pull during intro period (0 = no intro)
        uint256 introPulls;      // Number of pulls at introAmount before switching
        uint256 pullCount;       // Total successful pulls executed (also nonce for EIP-712)
        Interval interval;       // Weekly / Monthly / Yearly — immutable
        uint256 lastPulledAt;    // Timestamp of last successful pull (or trialEndsAt)
        uint256 pausedAt;        // Timestamp of pause start (0 = not paused)
        uint256 expiresAt;       // Timestamp of scheduled expiry (0 = none)
        uint256 trialEndsAt;     // Timestamp when trial ends (0 = no trial)
        uint256 gracePeriodDays; // Grace period in days before auto-expiry (1–30)
        bytes32 dataVaultId;     // DataOnce Phase 2 — encrypted data vault reference
        SubscriptionStatus status;
    }

    // -------------------------------------------------------------------------
    // State variables
    // -------------------------------------------------------------------------

    address public admin;
    address public pendingAdmin;  // Two-step admin transfer — zero if none pending
    address public keeper;
    address public protocolTreasury;
    address public merchantRegistry;

    /// @notice Protocol fee in bps. Initialised to PROTOCOL_FEE_BPS (50).
    ///         Admin can only lower it. Hard ceiling MAX_FEE_BPS (200).
    uint16  public feeBps;

    uint256 private _nextSubscriptionId;

    /// @notice Global token whitelist. Admin-controlled.
    ///         All whitelisted tokens available to all merchants and tiers.
    mapping(address => bool) public approvedTokens;
    address[] private _tokenList;

    mapping(uint256 => Subscription) public subscriptions;

    // -------------------------------------------------------------------------
    // Events
    // -------------------------------------------------------------------------

    event ProtocolDeployed(
        string  protocol,
        string  version,
        address indexed deployer,
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
        address guardian
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
    event SubscriptionPausedByMerchant(uint256 indexed id, address indexed merchant, uint256 resumesAt);
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
    ) EIP712("AuthOnce", "5") {
        require(_admin            != address(0), "ZeroAdmin");
        require(_keeper           != address(0), "ZeroKeeper");
        require(_protocolTreasury != address(0), "ZeroTreasury");
        require(_merchantRegistry != address(0), "ZeroRegistry");

        admin            = _admin;
        keeper           = _keeper;
        protocolTreasury = _protocolTreasury;
        merchantRegistry = _merchantRegistry;
        feeBps           = PROTOCOL_FEE_BPS; // 50 bps = 0.5%

        emit ProtocolDeployed(PROTOCOL, VERSION, msg.sender, block.chainid, block.timestamp);
    }

    // =========================================================================
    // USER ACTIONS
    // =========================================================================

    /// @notice Create a new subscription.
    ///
    /// @param merchant          Approved merchant wallet address
    /// @param safeVault         Wallet holding tokens — must have approved this contract.
    ///                          EOA: standard USDC approval.
    ///                          Contract wallet: must implement ERC-1271 and approve
    ///                          this vault via token.approve() before first pull.
    /// @param token             Payment token — must be in admin whitelist.
    ///                          Immutable after creation.
    /// @param amount            Full recurring price in token units (respects decimals).
    /// @param introAmount       Introductory price per pull (0 = no intro).
    ///                          Must be <= amount.
    /// @param introPulls        Number of pulls at introAmount (0 = no intro, max 12).
    /// @param interval          Weekly / Monthly / Yearly — immutable after creation.
    /// @param guardian          Address that can also cancel/pause (zero = none).
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
        require(merchant  != address(0), "ZeroMerchant");
        require(safeVault != address(0), "ZeroVault");
        require(token     != address(0), "ZeroToken");
        require(amount    >  0,          "ZeroAmount");
        require(approvedTokens[token],   "TokenNotApproved");
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

        id = _nextSubscriptionId++;

        subscriptions[id] = Subscription({
            owner:           msg.sender,
            guardian:        guardian,
            merchant:        merchant,
            safeVault:       safeVault,
            token:           token,
            amount:          amount,
            introAmount:     introAmount,
            introPulls:      introPulls,
            pullCount:       0,
            interval:        interval,
            lastPulledAt:    trialEndsAt, // First pull is due after trial ends
            pausedAt:        0,
            expiresAt:       0,
            trialEndsAt:     trialEndsAt,
            gracePeriodDays: graceDays,
            dataVaultId:     dataVaultId_,
            status:          SubscriptionStatus.Active
        });

        emit SubscriptionCreated(
            id, msg.sender, merchant, safeVault, token,
            amount, introAmount, introPulls, interval, guardian
        );
        emit GracePeriodSet(id, graceDays);
        if (trialEndsAt > 0) emit TrialStarted(id, trialEndsAt);
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

    function resumeSubscription(uint256 id) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.owner, "NotOwner");
        require(sub.status == SubscriptionStatus.Paused, "NotPaused");
        require(
            sub.pausedAt == 0 ||
            block.timestamp <= sub.pausedAt + (sub.gracePeriodDays * 1 days),
            "GracePeriodExpired"
        );
        sub.status   = SubscriptionStatus.Active;
        sub.pausedAt = 0;
        emit SubscriptionResumed(id, block.timestamp);
    }

    // =========================================================================
    // MERCHANT ACTIONS
    // =========================================================================

    /// @notice Merchant sets a scheduled expiry (price change flow).
    ///         Enforces 30-day minimum notice on-chain — subscriber always has
    ///         30 days to cancel before a price change takes effect.
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
    ///         Shifts lastPulledAt forward — subscriber does not need to act.
    ///         Does not change subscription status to Paused.
    function merchantPauseSubscription(uint256 id, uint256 pauseDays) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.merchant,              "NotMerchant");
        require(sub.status == SubscriptionStatus.Active, "NotActive");
        require(pauseDays >= 1,                          "MinOneDayPause");
        require(pauseDays <= 90,                         "PauseTooLong");

        sub.lastPulledAt  = block.timestamp + (pauseDays * 1 days);
        uint256 resumesAt = sub.lastPulledAt + _intervalToSeconds(sub.interval);
        emit SubscriptionPausedByMerchant(id, msg.sender, resumesAt);
    }

    // =========================================================================
    // KEEPER ACTIONS
    // =========================================================================

    /// @notice Execute a pull for a due subscription.
    ///
    ///         EOA subscribers (MetaMask, Ledger, Coinbase Wallet):
    ///           Pass signature = "" (empty bytes). ERC-1271 check is skipped.
    ///           Standard IERC20.transferFrom used — subscriber approved vault
    ///           at subscription creation.
    ///
    ///         Contract wallet subscribers (Gnosis Safe, AI agents, smart wallets):
    ///           Pass a valid EIP-712 PullAuthorisation signature with deadline.
    ///           Vault verifies via IERC1271.isValidSignature before transferring.
    ///           Keeper must generate the signature fresh each pull cycle with a
    ///           tight deadline (PULL_DEADLINE_TOLERANCE = 24 hours).
    ///
    ///         The pull amount is determined by pullCount vs introPulls —
    ///         introAmount for first introPulls pulls, then amount thereafter.
    ///
    /// @param id        Subscription ID
    /// @param deadline  EIP-712 signature deadline (unix timestamp).
    ///                  For EOA subscribers: pass 0 (ignored).
    ///                  For contract wallets: must be > block.timestamp and
    ///                  <= block.timestamp + PULL_DEADLINE_TOLERANCE.
    /// @param signature EIP-712 PullAuthorisation signature bytes.
    ///                  For EOA subscribers: pass "" (empty).
    ///                  For contract wallets: signed EIP-712 struct hash.
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

        // Check due date
        uint256 intervalSeconds = _intervalToSeconds(sub.interval);
        require(
            block.timestamp >= sub.lastPulledAt + intervalSeconds,
            "NotDueYet"
        );

        // Determine pull amount — intro pricing or full amount
        uint256 pullAmount = (sub.introAmount > 0 && sub.pullCount < sub.introPulls)
            ? sub.introAmount
            : sub.amount;

        address token     = sub.token;
        address safeVault = sub.safeVault;

        // ── ERC-1271 path: contract wallet subscriber ─────────────────────────
        // Only runs when safeVault has contract code deployed.
        // EOAs have no code — _isContract returns false — check is skipped entirely.
        if (_isContract(safeVault)) {
            // Deadline must be set and within the allowed tolerance window
            require(deadline > block.timestamp,                          "DeadlineExpired");
            require(deadline <= block.timestamp + PULL_DEADLINE_TOLERANCE, "DeadlineTooFar");

            // Build EIP-712 struct hash for PullAuthorisation
            // pullCount acts as a nonce — each pull has a unique hash
            bytes32 structHash = keccak256(abi.encode(
                PULL_AUTHORISATION_TYPEHASH,
                id,
                token,
                pullAmount,
                sub.pullCount, // nonce — incremented after every successful pull
                deadline
            ));

            // Final EIP-712 hash: "\x19\x01" + domainSeparator + structHash
            bytes32 digest = _hashTypedData(structHash);

            // Ask the contract wallet if the signature is valid
            bytes4 result = IERC1271(safeVault).isValidSignature(digest, signature);
            require(result == ERC1271_MAGIC, "ERC1271InvalidSignature");
        }
        // ── EOA path: no ERC-1271 check, signature and deadline ignored ───────

        // Check token balance
        uint256 currentBalance = IERC20(token).balanceOf(safeVault);
        if (currentBalance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientFunds(
                id, token, pullAmount, currentBalance,
                block.timestamp + (sub.gracePeriodDays * 1 days)
            );
            emit SubscriptionPaused(id, address(this), "insufficient_funds");
            return;
        }

        // Check token allowance
        uint256 currentAllowance = IERC20(token).allowance(safeVault, address(this));
        if (currentAllowance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientAllowance(id, token, pullAmount, currentAllowance);
            emit SubscriptionPaused(id, address(this), "insufficient_allowance");
            return;
        }

        // Calculate fee split — 0.5% to treasury, remainder to merchant
        uint256 fee              = (pullAmount * feeBps) / 10_000;
        uint256 merchantReceives = pullAmount - fee;

        // Transfer to merchant
        bool merchantSuccess = IERC20(token).transferFrom(
            safeVault,
            sub.merchant,
            merchantReceives
        );
        require(merchantSuccess, "MerchantTransferFailed");

        // Transfer protocol fee to treasury
        if (fee > 0) {
            bool feeSuccess = IERC20(token).transferFrom(
                safeVault,
                protocolTreasury,
                fee
            );
            require(feeSuccess, "FeeTransferFailed");
        }

        // Update state — pullCount is also the EIP-712 nonce
        sub.lastPulledAt = block.timestamp;
        sub.pullCount   += 1;

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
    ///         Available to all merchants and tiers immediately.
    function approveToken(address token) external onlyAdmin {
        require(token != address(0),   "ZeroToken");
        require(!approvedTokens[token], "AlreadyApproved");
        approvedTokens[token] = true;
        _tokenList.push(token);
        emit TokenApproved(token, msg.sender);
    }

    /// @notice Remove a token from the whitelist.
    ///         Existing subscriptions using this token are NOT affected —
    ///         only new subscriptions are blocked.
    function revokeToken(address token) external onlyAdmin {
        require(approvedTokens[token], "TokenNotApproved");
        approvedTokens[token] = false;
        emit TokenRevoked(token, msg.sender);
    }

    /// @notice Update the MerchantRegistry address.
    function setMerchantRegistry(address _registry) external onlyAdmin {
        require(_registry != address(0), "ZeroRegistry");
        emit RegistryUpdated(merchantRegistry, _registry);
        merchantRegistry = _registry;
    }

    /// @notice Lower the protocol fee. Cannot raise above MAX_FEE_BPS (2%).
    function setFeeBps(uint16 _feeBps) external onlyAdmin {
        require(_feeBps <= MAX_FEE_BPS, "FeeTooHigh");
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

    /// @notice Step 1 — propose a new admin.
    ///         New admin must call acceptAdminTransfer() to complete.
    ///         Prevents permanent loss from a typo or compromised key.
    function proposeAdminTransfer(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ZeroAdmin");
        require(newAdmin != admin,      "AlreadyAdmin");
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    /// @notice Step 2 — pending admin accepts and becomes admin.
    function acceptAdminTransfer() external {
        require(msg.sender == pendingAdmin, "NotPendingAdmin");
        address old  = admin;
        admin        = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(old, admin);
    }

    /// @notice Cancel a pending admin nomination. Current admin only.
    function cancelAdminTransfer() external onlyAdmin {
        require(pendingAdmin != address(0), "NoPendingTransfer");
        pendingAdmin = address(0);
        emit AdminTransferCancelled(msg.sender);
    }

    // =========================================================================
    // VIEW HELPERS
    // =========================================================================

    /// @notice Returns the EIP-712 digest for a PullAuthorisation.
    ///         Keeper calls this off-chain to construct the hash before
    ///         requesting a signature from a contract wallet subscriber.
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
    function nextPullDue(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.lastPulledAt == 0) return 0;
        return sub.lastPulledAt + _intervalToSeconds(sub.interval);
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
    function isDue(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        if (sub.status != SubscriptionStatus.Active) return false;
        if (sub.expiresAt > 0 && block.timestamp >= sub.expiresAt) return false;
        if (sub.lastPulledAt == 0) return true;
        return block.timestamp >= sub.lastPulledAt + _intervalToSeconds(sub.interval);
    }

    /// @notice Returns true if subscription is in trial period.
    function inTrial(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.trialEndsAt > 0 && block.timestamp < sub.trialEndsAt;
    }

    /// @notice Returns true if subscription is in intro pricing period.
    function inIntroPricing(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.introAmount > 0 && sub.pullCount < sub.introPulls;
    }

    /// @notice Returns days remaining in trial period (0 if none or ended).
    function daysUntilTrialEnds(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.trialEndsAt == 0 || block.timestamp >= sub.trialEndsAt) return 0;
        return (sub.trialEndsAt - block.timestamp) / 1 days;
    }

    /// @notice Returns days remaining until scheduled expiry (0 if none).
    function daysUntilExpiry(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.expiresAt == 0 || block.timestamp >= sub.expiresAt) return 0;
        return (sub.expiresAt - block.timestamp) / 1 days;
    }

    /// @notice Returns how many intro pulls remain (0 if not in intro period).
    function introPullsRemaining(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.introAmount == 0 || sub.pullCount >= sub.introPulls) return 0;
        return sub.introPulls - sub.pullCount;
    }

    /// @notice Returns the full list of approved token addresses.
    function approvedTokenList() external view returns (address[] memory) {
        return _tokenList;
    }

    /// @notice Returns the payment token for a given subscription.
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
    ///         Distinguishes EOA safeVaults from ERC-1271 contract wallets.
    ///         Note: returns false during a contract's own constructor execution.
    ///         This is acceptable — no contract subscribes during its own constructor.
    function _isContract(address addr) internal view returns (bool) {
        uint256 size;
        assembly { size := extcodesize(addr) }
        return size > 0;
    }
}
