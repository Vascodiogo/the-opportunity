// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// =============================================================================
//  SubscriptionVault.sol — The Opportunity Protocol
//
//  Network:    Base Sepolia (testnet)
//  Address:    0x2ED847da7f88231Ac6907196868adF4840A97f49
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  A Safe (Gnosis) Module that enables intent-based recurring USDC
//  subscriptions. Users authorise once; the Keeper pulls on schedule.
//  All business rules mirror CLAUDE.md §3 exactly.
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
    // Constants
    // -------------------------------------------------------------------------

    /// @notice USDC on Base. Hardcoded — no other token accepted (CLAUDE.md §3.2).
    address public constant USDC = 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913;

    /// @notice Hard ceiling on protocol fee: 2% = 200 bps (CLAUDE.md §3.9, §7).
    uint16 public constant MAX_FEE_BPS = 200;

    /// @notice Grace period before underfunded subscription auto-expires (CLAUDE.md §3.3).
    uint256 public constant GRACE_PERIOD = 7 days;

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
    }

    // =========================================================================
    // USER ACTIONS
    // =========================================================================

    function createSubscription(
        address  merchant,
        address  safeVault,
        uint256  amount,
        Interval interval,
        address  guardian
    ) external returns (uint256 id) {
        require(msg.sender != address(0),    "ZeroOwner");
        require(merchant   != address(0),    "ZeroMerchant");
        require(safeVault  != address(0),    "ZeroVault");
        require(amount     >  0,             "ZeroAmount");
        require(approvedMerchants[merchant], "MerchantNotApproved");

        id = _nextSubscriptionId++;

        subscriptions[id] = Subscription({
            owner:        msg.sender,
            guardian:     guardian,
            merchant:     merchant,
            safeVault:    safeVault,
            amount:       amount,
            interval:     interval,
            lastPulledAt: 0,
            pausedAt:     0,
            status:       SubscriptionStatus.Active
        });

        emit SubscriptionCreated(id, msg.sender, merchant, safeVault, amount, interval, guardian);
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
    // KEEPER ACTIONS (CLAUDE.md §5 — keeper only)
    // =========================================================================

    function executePull(uint256 id, uint256 pullAmount)
        external
        nonReentrant
        onlyKeeper
    {
        Subscription storage sub = subscriptions[id];

        require(sub.status == SubscriptionStatus.Active, "NotActive");

        uint256 intervalSeconds = _intervalToSeconds(sub.interval);
        require(
            block.timestamp >= sub.lastPulledAt + intervalSeconds,
            "NotDueYet"
        );

        // Hard spending cap — enforced on-chain regardless of what keeper sends
        require(pullAmount <= sub.amount, "ExceedsCap");
        require(pullAmount > 0,           "ZeroAmount");

        // Check vault balance
        uint256 currentVaultBalance = IERC20(USDC).balanceOf(sub.safeVault);

        if (currentVaultBalance < pullAmount) {
            sub.status   = SubscriptionStatus.Paused;
            sub.pausedAt = block.timestamp;
            emit InsufficientFunds(id, pullAmount, currentVaultBalance, block.timestamp + GRACE_PERIOD);
            emit SubscriptionPaused(id, address(this), "insufficient_funds");
            return;
        }

        // Calculate fee split (CLAUDE.md §3.9)
        uint256 fee              = (pullAmount * feeBps) / 10_000;
        uint256 merchantReceives = pullAmount - fee;

        // Transfer to merchant via Safe module
        bytes memory merchantCall = abi.encodeWithSelector(
            IERC20.transfer.selector,
            sub.merchant,
            merchantReceives
        );
        bool merchantSuccess = ISafe(sub.safeVault).execTransactionFromModule(
            USDC, 0, merchantCall, 0
        );
        require(merchantSuccess, "MerchantTransferFailed");

        // Transfer fee to protocol treasury
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
        if (sub.lastPulledAt == 0) return true;
        return block.timestamp >= sub.lastPulledAt + _intervalToSeconds(sub.interval);
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
