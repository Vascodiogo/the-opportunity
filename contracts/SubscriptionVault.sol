// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// =============================================================================
//  SubscriptionVault.sol — AuthOnce Protocol v4
//
//  Network:    Base Sepolia (testnet) / Base Mainnet
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  Changes from v3:
//    - Pull mechanism: ISafe.execTransactionFromModule → IERC20.transferFrom
//      Subscribers approve the vault contract directly (no Gnosis Safe required)
//    - Introductory pricing: introAmount + introPulls + pullCount
//      Enables "$5 first month, then $20/month" natively on-chain
//    - executePull() no longer takes a pullAmount parameter —
//      the contract calculates the correct amount from pullCount
//    - createSubscription() validates introAmount <= amount
//    - pullCount incremented on every successful pull
//
//  License: Business Source License 1.1
//  © 2026 Vasco Humberto dos Reis Diogo. All Rights Reserved.
//  https://authonce.io
// =============================================================================

// -----------------------------------------------------------------------------
// Interface — ERC-20 (USDC)
// -----------------------------------------------------------------------------

interface IERC20 {
    function transferFrom(address from, address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
}

// -----------------------------------------------------------------------------
// ReentrancyGuard (inlined)
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
// Main Contract
// -----------------------------------------------------------------------------

contract SubscriptionVault is ReentrancyGuard {

    // -------------------------------------------------------------------------
    // Watermark — origin proof baked into bytecode forever
    // -------------------------------------------------------------------------

    string public constant PROTOCOL      = "AuthOnce Protocol";
    string public constant VERSION       = "4.0.0";
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice USDC on Base Sepolia. Hardcoded — no other token accepted.
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    /// @notice Hard ceiling on protocol fee: 2% = 200 bps.
    uint16 public constant MAX_FEE_BPS = 200;

    uint256 public constant MIN_GRACE_DAYS   = 1;
    uint256 public constant MAX_GRACE_DAYS   = 30;
    uint256 public constant DEFAULT_GRACE_DAYS = 7;

    /// @notice Minimum notice period for merchant price changes — 30 days.
    uint256 public constant MIN_EXPIRY_NOTICE = 30 days;

    /// @notice Maximum trial period — 90 days.
    uint256 public constant MAX_TRIAL_DAYS = 90;

    /// @notice Maximum introductory pulls — 12 (e.g. 12 months at intro price).
    uint256 public constant MAX_INTRO_PULLS = 12;

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
        address owner;           // Subscriber wallet (holds USDC, approves vault)
        address guardian;        // Can also cancel/pause — zero address if none
        address merchant;        // Approved merchant — immutable after creation
        address safeVault;       // Wallet that holds USDC (= owner for non-Safe wallets)
        uint256 amount;          // Full recurring USDC per pull (6-decimal precision)
        uint256 introAmount;     // USDC per pull during intro period (0 = no intro pricing)
        uint256 introPulls;      // How many pulls at introAmount before switching to amount
        uint256 pullCount;       // How many successful pulls have executed
        Interval interval;       // Weekly / Monthly / Yearly — immutable
        uint256 lastPulledAt;    // Timestamp of last successful pull (or trialEndsAt)
        uint256 pausedAt;        // Timestamp of pause start (0 = not paused)
        uint256 expiresAt;       // Timestamp of scheduled expiry (0 = none)
        uint256 trialEndsAt;     // Timestamp when trial ends (0 = no trial)
        uint256 gracePeriodDays; // Grace period in days before auto-expiry (1–30)
        SubscriptionStatus status;
    }

    // -------------------------------------------------------------------------
    // State variables
    // -------------------------------------------------------------------------

    address public admin;
    address public keeper;
    address public protocolTreasury;
    uint16  public feeBps;
    uint256 private _nextSubscriptionId;

    mapping(uint256 => Subscription) public subscriptions;
    mapping(address => bool) public approvedMerchants;

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
        uint256 amount,
        uint256 introAmount,
        uint256 introPulls,
        Interval interval,
        address guardian
    );

    event PaymentExecuted(
        uint256 indexed id,
        uint256 amount,
        uint256 merchantReceived,
        uint256 fee,
        uint256 pullCount,
        uint256 timestamp
    );

    event InsufficientFunds(
        uint256 indexed id,
        uint256 required,
        uint256 available,
        uint256 pausedUntil
    );

    event InsufficientAllowance(
        uint256 indexed id,
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
    event MerchantApproved(address indexed merchant);
    event MerchantRevoked(address indexed merchant);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

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
        uint16  _feeBps
    ) {
        require(_admin            != address(0), "ZeroAdmin");
        require(_keeper           != address(0), "ZeroKeeper");
        require(_protocolTreasury != address(0), "ZeroTreasury");
        require(_feeBps           <= MAX_FEE_BPS, "FeeTooHigh");

        admin            = _admin;
        keeper           = _keeper;
        protocolTreasury = _protocolTreasury;
        feeBps           = _feeBps;

        emit ProtocolDeployed(PROTOCOL, VERSION, msg.sender, block.chainid, block.timestamp);
    }

    // =========================================================================
    // USER ACTIONS
    // =========================================================================

    /// @notice Create a new subscription.
    /// @param merchant         Approved merchant wallet address
    /// @param safeVault        Wallet holding USDC — must have approved this contract
    /// @param amount           Full recurring price in USDC (6 decimals)
    /// @param introAmount      Introductory price per pull (0 = no intro pricing)
    ///                         Must be <= amount. Example: 5 USDC for first pull, then 20 USDC.
    /// @param introPulls       Number of pulls at introAmount (0 = no intro, max 12)
    /// @param interval         Weekly / Monthly / Yearly
    /// @param guardian         Address that can also cancel/pause (zero = none)
    /// @param trialDays        Free trial days before first payment (0 = no trial, max 90)
    /// @param gracePeriodDays_ Grace period on payment failure (0 = default 7 days, max 30)
    function createSubscription(
        address  merchant,
        address  safeVault,
        uint256  amount,
        uint256  introAmount,
        uint256  introPulls,
        Interval interval,
        address  guardian,
        uint256  trialDays,
        uint256  gracePeriodDays_
    ) external returns (uint256 id) {
        require(msg.sender  != address(0),    "ZeroOwner");
        require(merchant    != address(0),    "ZeroMerchant");
        require(safeVault   != address(0),    "ZeroVault");
        require(amount      >  0,             "ZeroAmount");
        require(approvedMerchants[merchant],  "MerchantNotApproved");
        require(trialDays   <= MAX_TRIAL_DAYS, "TrialTooLong");
        require(introPulls  <= MAX_INTRO_PULLS, "TooManyIntroPulls");
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
            amount:          amount,
            introAmount:     introAmount,
            introPulls:      introPulls,
            pullCount:       0,
            interval:        interval,
            lastPulledAt:    trialEndsAt,  // First pull due after trial ends
            pausedAt:        0,
            expiresAt:       0,
            trialEndsAt:     trialEndsAt,
            gracePeriodDays: graceDays,
            status:          SubscriptionStatus.Active
        });

        emit SubscriptionCreated(id, msg.sender, merchant, safeVault, amount, introAmount, introPulls, interval, guardian);
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
            sub.pausedAt == 0 || block.timestamp <= sub.pausedAt + (sub.gracePeriodDays * 1 days),
            "GracePeriodExpired"
        );
        sub.status   = SubscriptionStatus.Active;
        sub.pausedAt = 0;
        emit SubscriptionResumed(id, block.timestamp);
    }

    // =========================================================================
    // MERCHANT ACTIONS
    // =========================================================================

    /// @notice Merchant sets a scheduled expiry (price change flow — 30-day notice).
    function setProductExpiry(uint256 id, uint256 expiresAt) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.merchant,                            "NotMerchant");
        require(sub.status == SubscriptionStatus.Active,               "NotActive");
        require(expiresAt >= block.timestamp + MIN_EXPIRY_NOTICE,      "InsufficientNotice");
        require(sub.expiresAt == 0 || expiresAt > sub.expiresAt,       "CannotShortenExpiry");

        uint256 noticeDays = (expiresAt - block.timestamp) / 1 days;
        sub.expiresAt = expiresAt;
        emit ProductExpirySet(id, msg.sender, expiresAt, noticeDays);
    }

    /// @notice Merchant pauses a subscriber's billing for customer service (max 90 days).
    function merchantPauseSubscription(uint256 id, uint256 pauseDays) external {
        Subscription storage sub = subscriptions[id];
        require(msg.sender == sub.merchant,            "NotMerchant");
        require(sub.status == SubscriptionStatus.Active, "NotActive");
        require(pauseDays >= 1,                        "MinOneDayPause");
        require(pauseDays <= 90,                       "PauseTooLong");

        sub.lastPulledAt = block.timestamp + (pauseDays * 1 days);
        uint256 resumesAt = sub.lastPulledAt + _intervalToSeconds(sub.interval);
        emit SubscriptionPausedByMerchant(id, msg.sender, resumesAt);
    }

    // =========================================================================
    // KEEPER ACTIONS
    // =========================================================================

    /// @notice Execute a pull for a due subscription.
    ///         The contract determines the correct amount based on pullCount and introAmount.
    ///         Pulls introAmount for the first introPulls pulls, then amount thereafter.
    ///         Uses IERC20.transferFrom — subscriber must have approved this contract.
    function executePull(uint256 id)
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

        // Determine amount for this pull
        // introAmount applies for the first introPulls pulls
        uint256 pullAmount = (sub.introAmount > 0 && sub.pullCount < sub.introPulls)
            ? sub.introAmount
            : sub.amount;

        // Check balance
        uint256 currentBalance = IERC20(USDC).balanceOf(sub.safeVault);
        if (currentBalance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientFunds(id, pullAmount, currentBalance, block.timestamp + (sub.gracePeriodDays * 1 days));
            emit SubscriptionPaused(id, address(this), "insufficient_funds");
            return;
        }

        // Check allowance
        uint256 currentAllowance = IERC20(USDC).allowance(sub.safeVault, address(this));
        if (currentAllowance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientAllowance(id, pullAmount, currentAllowance);
            emit SubscriptionPaused(id, address(this), "insufficient_allowance");
            return;
        }

        // Calculate fee split
        uint256 fee              = (pullAmount * feeBps) / 10_000;
        uint256 merchantReceives = pullAmount - fee;

        // Transfer to merchant
        bool merchantSuccess = IERC20(USDC).transferFrom(
            sub.safeVault,
            sub.merchant,
            merchantReceives
        );
        require(merchantSuccess, "MerchantTransferFailed");

        // Transfer fee to treasury
        if (fee > 0) {
            bool feeSuccess = IERC20(USDC).transferFrom(
                sub.safeVault,
                protocolTreasury,
                fee
            );
            require(feeSuccess, "FeeTransferFailed");
        }

        sub.lastPulledAt = block.timestamp;
        sub.pullCount   += 1;

        emit PaymentExecuted(id, pullAmount, merchantReceives, fee, sub.pullCount, block.timestamp);
    }

    /// @notice Expire a subscription that has exceeded its grace period.
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

    function approveMerchant(address merchant) external onlyAdmin {
        require(merchant != address(0), "ZeroAddress");
        approvedMerchants[merchant] = true;
        emit MerchantApproved(merchant);
    }

    function revokeMerchant(address merchant) external onlyAdmin {
        approvedMerchants[merchant] = false;
        emit MerchantRevoked(merchant);
    }

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

    function transferAdmin(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "ZeroAdmin");
        admin = newAdmin;
    }

    // =========================================================================
    // VIEW HELPERS
    // =========================================================================

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

    /// @notice Returns current USDC balance of the subscription vault.
    function vaultBalance(uint256 id) external view returns (uint256) {
        return IERC20(USDC).balanceOf(subscriptions[id].safeVault);
    }

    /// @notice Returns current USDC allowance granted to this contract by the vault.
    function vaultAllowance(uint256 id) external view returns (uint256) {
        return IERC20(USDC).allowance(subscriptions[id].safeVault, address(this));
    }

    /// @notice Returns true if the subscription is due for a pull.
    function isDue(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        if (sub.status != SubscriptionStatus.Active) return false;
        if (sub.expiresAt > 0 && block.timestamp >= sub.expiresAt) return false;
        if (sub.lastPulledAt == 0) return true;
        return block.timestamp >= sub.lastPulledAt + _intervalToSeconds(sub.interval);
    }

    /// @notice Returns true if subscription is currently in trial period.
    function inTrial(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.trialEndsAt > 0 && block.timestamp < sub.trialEndsAt;
    }

    /// @notice Returns true if subscription is currently in intro pricing period.
    function inIntroPricing(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.introAmount > 0 && sub.pullCount < sub.introPulls;
    }

    /// @notice Returns days remaining in trial period (0 if no trial or ended).
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

    // =========================================================================
    // INTERNAL HELPERS
    // =========================================================================

    function _intervalToSeconds(Interval interval) internal pure returns (uint256) {
        if (interval == Interval.Weekly)  return WEEKLY;
        if (interval == Interval.Monthly) return MONTHLY;
        return YEARLY;
    }
}
