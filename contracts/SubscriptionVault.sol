// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// =============================================================================
//  SubscriptionVault.sol — AuthOnce Protocol
//
//  Network:    Base Sepolia (testnet)
//  Address:    0x2ED847da7f88231Ac6907196868adF4840A97f49
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  A Safe (Gnosis) Module that enables intent-based recurring USDC
//  subscriptions. Users authorise once; the Keeper pulls on schedule.
//  All business rules mirror CLAUDE.md §3 exactly.
//
//  v2 additions:
//    - setProductExpiry() — merchant price change with 30-day minimum notice
//    - trialEndsAt — free trial period before first payment
//    - merchantPauseSubscription() — merchant customer service tool
//    - MAX_TRIAL_PERIOD constant — 90 days maximum trial
//
//  License: Business Source License 1.1
//  © 2026 Vasco Humberto dos Reis Diogo. All Rights Reserved.
//  https://authonce.io
// =============================================================================

// -----------------------------------------------------------------------------
// Interfaces
// -----------------------------------------------------------------------------

/// @dev The only Safe function we need: execute a transaction as a module.
interface ISafe {
    function execTransactionFromModule(
        address to,
        uint256 value,
        bytes calldata data,
        uint8 operation
    ) external returns (bool success);
}

/// @dev Minimal ERC-20 interface (USDC). We only need transfer() and balanceOf().
interface IERC20 {
    function transfer(address to, uint256 amount) external returns (bool);
    function balanceOf(address account) external view returns (uint256);
}

// -----------------------------------------------------------------------------
// ReentrancyGuard (inlined — no external import needed)
// -----------------------------------------------------------------------------

abstract contract ReentrancyGuard {
    uint256 private constant NOT_ENTERED = 1;
    uint256 private constant ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = NOT_ENTERED;
    }

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
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_REPO   = "github.com/Vascodiogo/the-opportunity";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    /// @notice USDC on Base. Hardcoded — no other token accepted (CLAUDE.md §3.2).
    address public constant USDC = 0x036CbD53842c5426634e7929541eC2318f3dCF7e;

    /// @notice Hard ceiling on protocol fee: 2% = 200 bps (CLAUDE.md §3.9, §7).
    uint16 public constant MAX_FEE_BPS = 200;

    /// @notice Grace period before underfunded subscription auto-expires (CLAUDE.md §3.3).
    uint256 public constant GRACE_PERIOD = 7 days;

    /// @notice Minimum notice period for merchant price changes — 30 days, unbypassable.
    uint256 public constant MIN_EXPIRY_NOTICE = 30 days;

    /// @notice Maximum trial period a merchant can offer — 90 days.
    uint256 public constant MAX_TRIAL_PERIOD = 90 days;

    uint256 public constant WEEKLY  =    604_800; //   7 days
    uint256 public constant MONTHLY =  2_592_000; //  30 days
    uint256 public constant YEARLY  = 31_536_000; // 365 days

    // -------------------------------------------------------------------------
    // Enums
    // -------------------------------------------------------------------------

    enum SubscriptionStatus { Active, Paused, Cancelled, Expired }
    enum Interval { Weekly, Monthly, Yearly }

    // -------------------------------------------------------------------------
    // Core data structure (CLAUDE.md §4)
    // -------------------------------------------------------------------------

    struct Subscription {
        address owner;          // Safe vault owner (subscriber)
        address guardian;       // Can also cancel/pause — zero address if none
        address merchant;       // Approved merchant — immutable after creation
        address safeVault;      // The Safe wallet that holds the USDC
        uint256 amount;         // USDC per pull, 6-decimal precision (hard cap)
        Interval interval;      // Weekly / Monthly / Yearly — immutable
        uint256 lastPulledAt;   // Timestamp of last successful pull
        uint256 pausedAt;       // Timestamp of pause start (0 = not paused)
        uint256 expiresAt;      // Timestamp of scheduled expiry (0 = no expiry set)
        uint256 trialEndsAt;    // Timestamp when trial ends (0 = no trial)
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
    // Events (CLAUDE.md §3.10)
    // -------------------------------------------------------------------------

    /// @notice Emitted once at deployment — used by monitor.js to detect copies.
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
        Interval interval,
        address guardian
    );

    event PaymentExecuted(
        uint256 indexed id,
        uint256 amount,
        uint256 merchantReceived,
        uint256 fee,
        uint256 timestamp
    );

    event InsufficientFunds(
        uint256 indexed id,
        uint256 required,
        uint256 available,
        uint256 pausedUntil
    );

    event SubscriptionPaused(uint256 indexed id, address pausedBy, string reason);
    event SubscriptionCancelled(uint256 indexed id, address cancelledBy);
    event SubscriptionResumed(uint256 indexed id, uint256 timestamp);
    event SubscriptionExpired(uint256 indexed id, uint256 timestamp);

    /// @notice Emitted when merchant pauses a subscription for customer service
    event SubscriptionPausedByMerchant(uint256 indexed id, address indexed merchant, uint256 resumesAt);

    /// @notice Emitted when a trial period starts
    event TrialStarted(uint256 indexed id, uint256 trialEndsAt);

    event MerchantApproved(address indexed merchant);
    event MerchantRevoked(address indexed merchant);
    event KeeperUpdated(address indexed oldKeeper, address indexed newKeeper);
    event FeeUpdated(uint16 oldFeeBps, uint16 newFeeBps);
    event TreasuryUpdated(address indexed oldTreasury, address indexed newTreasury);

    /// @notice Emitted when a merchant sets a scheduled expiry on a subscription
    event ProductExpirySet(
        uint256 indexed id,
        address indexed merchant,
        uint256 expiresAt,
        uint256 noticeDays
    );

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

        emit ProtocolDeployed(
            PROTOCOL,
            "1.0.0",
            msg.sender,
            block.chainid,
            block.timestamp
        );
    }

    // =========================================================================
    // USER ACTIONS
    // =========================================================================

    function createSubscription(
        address  merchant,
        address  safeVault,
        uint256  amount,
        Interval interval,
        address  guardian,
        uint256  trialDays   // 0 = no trial, max 90 days
    ) external returns (uint256 id) {
        require(msg.sender != address(0),    "ZeroOwner");
        require(merchant   != address(0),    "ZeroMerchant");
        require(safeVault  != address(0),    "ZeroVault");
        require(amount     >  0,             "ZeroAmount");
        require(approvedMerchants[merchant], "MerchantNotApproved");
        require(trialDays  <= 90,            "TrialTooLong");

        uint256 trialEndsAt = trialDays > 0
            ? block.timestamp + (trialDays * 1 days)
            : 0;

        id = _nextSubscriptionId++;

        subscriptions[id] = Subscription({
            owner:        msg.sender,
            guardian:     guardian,
            merchant:     merchant,
            safeVault:    safeVault,
            amount:       amount,
            interval:     interval,
            lastPulledAt: trialEndsAt,  // First pull due after trial ends
            pausedAt:     0,
            expiresAt:    0,
            trialEndsAt:  trialEndsAt,
            status:       SubscriptionStatus.Active
        });

        emit SubscriptionCreated(id, msg.sender, merchant, safeVault, amount, interval, guardian);
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
            sub.pausedAt == 0 || block.timestamp <= sub.pausedAt + GRACE_PERIOD,
            "GracePeriodExpired"
        );
        sub.status   = SubscriptionStatus.Active;
        sub.pausedAt = 0;
        emit SubscriptionResumed(id, block.timestamp);
    }

    // =========================================================================
    // MERCHANT ACTIONS
    // =========================================================================

    /// @notice Merchant sets a scheduled expiry on a subscription (price change flow).
    function setProductExpiry(uint256 id, uint256 expiresAt) external {
        Subscription storage sub = subscriptions[id];

        require(msg.sender == sub.merchant, "NotMerchant");
        require(sub.status == SubscriptionStatus.Active, "NotActive");
        require(
            expiresAt >= block.timestamp + MIN_EXPIRY_NOTICE,
            "InsufficientNotice"
        );
        require(
            sub.expiresAt == 0 || expiresAt > sub.expiresAt,
            "CannotShortenExpiry"
        );

        uint256 noticeDays = (expiresAt - block.timestamp) / 1 days;
        sub.expiresAt = expiresAt;

        emit ProductExpirySet(id, msg.sender, expiresAt, noticeDays);
    }

    /// @notice Merchant pauses a subscriber's billing for customer service purposes.
    function merchantPauseSubscription(uint256 id, uint256 pauseDays) external {
        Subscription storage sub = subscriptions[id];

        require(msg.sender == sub.merchant, "NotMerchant");
        require(sub.status == SubscriptionStatus.Active, "NotActive");
        require(pauseDays >= 1,  "MinOneDayPause");
        require(pauseDays <= 90, "PauseTooLong");

        sub.lastPulledAt = block.timestamp + (pauseDays * 1 days);

        uint256 resumesAt = sub.lastPulledAt + _intervalToSeconds(sub.interval);

        emit SubscriptionPausedByMerchant(id, msg.sender, resumesAt);
    }

    // =========================================================================
    // KEEPER ACTIONS (CLAUDE.md §5 — keeper only)
    // =========================================================================

    function executePull(uint256 id, uint256 pullAmount)
        external
        nonReentrant
        onlyKeeper
    {
        Subscription storage sub = subscriptions[id];

        require(sub.status == SubscriptionStatus.Active, "NotActive");

        if (sub.expiresAt > 0 && block.timestamp >= sub.expiresAt) {
            sub.status = SubscriptionStatus.Expired;
            emit SubscriptionExpired(id, block.timestamp);
            return;
        }

        uint256 intervalSeconds = _intervalToSeconds(sub.interval);
        require(
            block.timestamp >= sub.lastPulledAt + intervalSeconds,
            "NotDueYet"
        );

        require(pullAmount <= sub.amount, "ExceedsCap");
        require(pullAmount > 0,           "ZeroAmount");

        uint256 currentVaultBalance = IERC20(USDC).balanceOf(sub.safeVault);

        if (currentVaultBalance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientFunds(id, pullAmount, currentVaultBalance, block.timestamp + GRACE_PERIOD);
            emit SubscriptionPaused(id, address(this), "insufficient_funds");
            return;
        }

        uint256 fee              = (pullAmount * feeBps) / 10_000;
        uint256 merchantReceives = pullAmount - fee;

        bytes memory merchantCall = abi.encodeWithSelector(
            IERC20.transfer.selector,
            sub.merchant,
            merchantReceives
        );
        bool merchantSuccess = ISafe(sub.safeVault).execTransactionFromModule(
            USDC, 0, merchantCall, 0
        );
        require(merchantSuccess, "MerchantTransferFailed");

        if (fee > 0) {
            bytes memory feeCall = abi.encodeWithSelector(
                IERC20.transfer.selector,
                protocolTreasury,
                fee
            );
            bool feeSuccess = ISafe(sub.safeVault).execTransactionFromModule(
                USDC, 0, feeCall, 0
            );
            require(feeSuccess, "FeeTransferFailed");
        }

        sub.lastPulledAt = block.timestamp;
        emit PaymentExecuted(id, pullAmount, merchantReceives, fee, block.timestamp);
    }

    function expireSubscription(uint256 id) external onlyKeeper {
        Subscription storage sub = subscriptions[id];
        require(sub.status == SubscriptionStatus.Paused, "NotPaused");
        require(sub.pausedAt > 0,                        "NeverPaused");
        require(block.timestamp > sub.pausedAt + GRACE_PERIOD, "GraceStillActive");
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

    // =========================================================================
    // VIEW HELPERS
    // =========================================================================

    function nextPullDue(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.lastPulledAt == 0) return 0;
        return sub.lastPulledAt + _intervalToSeconds(sub.interval);
    }

    function vaultBalance(uint256 id) external view returns (uint256) {
        return IERC20(USDC).balanceOf(subscriptions[id].safeVault);
    }

    function isDue(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        if (sub.status != SubscriptionStatus.Active) return false;
        if (sub.expiresAt > 0 && block.timestamp >= sub.expiresAt) return false;
        if (sub.lastPulledAt == 0) return true;
        return block.timestamp >= sub.lastPulledAt + _intervalToSeconds(sub.interval);
    }

    /// @notice Returns days remaining in trial period (0 if no trial or trial ended)
    function daysUntilTrialEnds(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.trialEndsAt == 0) return 0;
        if (block.timestamp >= sub.trialEndsAt) return 0;
        return (sub.trialEndsAt - block.timestamp) / 1 days;
    }

    /// @notice Returns true if subscription is currently in trial period
    function inTrial(uint256 id) external view returns (bool) {
        Subscription storage sub = subscriptions[id];
        return sub.trialEndsAt > 0 && block.timestamp < sub.trialEndsAt;
    }

    /// @notice Returns days remaining until scheduled expiry (0 if no expiry set)
    function daysUntilExpiry(uint256 id) external view returns (uint256) {
        Subscription storage sub = subscriptions[id];
        if (sub.expiresAt == 0) return 0;
        if (block.timestamp >= sub.expiresAt) return 0;
        return (sub.expiresAt - block.timestamp) / 1 days;
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
