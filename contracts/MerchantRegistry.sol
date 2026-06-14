// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.24;

// =============================================================================
//  MerchantRegistry.sol — AuthOnce Protocol v4
//  "The Guest List"
//
//  Network:    Base Sepolia (testnet) / Base Mainnet
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  Changes from v3 (security fixes — post Hacken AI audit):
//
//    [V7-C2] CRITICAL — MAX_MERCHANTS cap now enforces against _approvedMerchantCount
//            instead of _merchantList.length. _merchantList is a historical log that
//            retains revoked merchants; using it for the cap caused approved slots to
//            be incorrectly consumed by removed entries, making the registry falsely
//            full. _approvedMerchantCount is the live count, maintained on every
//            approve and revoke. One-line fix in _approve() internal function.
//
//    [V7-L2/L3] LOW — blacklistMerchant() now rejects attempts to blacklist the
//            current admin or pendingAdmin. Without this, a malicious or mistaken
//            admin could permanently ban the incoming admin during a transfer,
//            creating an irrecoverable state (no un-blacklist function exists).
//            Two require() guards added.
//
//    [V7-L5] LOW — IS_MAINNET stored as public immutable. Previously the _isMainnet
//            constructor parameter was not stored, making it impossible to verify
//            post-deployment whether the mainnet admin check was enforced.
//            Now visible on Basescan as IS_MAINNET.
//
//    [MR-01] HIGH — require(_admin.code.length > 0) re-enabled for mainnet.
//            Use compile-time constant IS_MAINNET to control enforcement.
//            Testnet deploys set IS_MAINNET = false in deploy.js.
//            Mainnet deploys set IS_MAINNET = true. No commented-out security
//            checks in production code.
//
//    [MR-02] MEDIUM — selfRegister() spam throttle added. One registration
//            per address per 1 hour. Makes bot-spam economically infeasible
//            without a registration fee. selfServeEnabled = false at mainnet
//            launch regardless — this is defence-in-depth for when it opens.
//
//    [MR-03] LOW — batchApproveMerchants gains skipBlacklisted parameter.
//            When true, blacklisted addresses are skipped silently.
//            When false (default), reverts on blacklisted address (original behaviour).
//
//    [MR-04] INFO — approvedMerchantCount() view added (O(1) live count).
//            getMerchantsPage() pagination helper added.
//            NatSpec clarifies _merchantList contains historical entries.
//
//  Security fixes carried from v2:
//    [H1] Admin must be a contract at deploy (now enforced via IS_MAINNET flag)
//    [M2] Blacklist mapping — permanently bans merchants
//    [M3] setSelfServe() no-op guard
//    [L2] proposeAdminTransfer emits cancellation on overwrite
//    [L3] MAX_MERCHANTS cap
//    [L4] batchApproveMerchants + batchRevokeMerchants
//
//  License: Business Source License 1.1
//  © 2026 Vasco Humberto dos Reis Diogo. All Rights Reserved.
//  https://authonce.io
// =============================================================================

contract MerchantRegistry {

    // -------------------------------------------------------------------------
    // Watermark
    // -------------------------------------------------------------------------

    string public constant PROTOCOL      = "AuthOnce Protocol";
    string public constant VERSION       = "4.0.0";
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_REPO   = "github.com/Vascodiogo/the-opportunity";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

    // -------------------------------------------------------------------------
    // Constants
    // -------------------------------------------------------------------------

    uint256 public constant MAX_MERCHANTS = 10_000;

    /// @notice [MR-02] Self-registration cooldown — one registration per address per hour.
    ///         Prevents bot-spam when selfServeEnabled = true.
    uint256 public constant SELF_REGISTER_COOLDOWN = 1 hours;

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

    event MerchantApproved(address indexed merchant, address indexed approvedBy);
    event MerchantSelfRegistered(address indexed merchant);  // [MR-02] Distinct from admin-approved
    event MerchantRevoked(address indexed merchant, address indexed revokedBy);
    event MerchantBlacklisted(address indexed merchant, address indexed blacklistedBy);
    event SelfServeUpdated(bool indexed enabled, address indexed updatedBy);
    event AdminTransferProposed(address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferAccepted(address indexed oldAdmin, address indexed newAdmin);
    event AdminTransferCancelled(address indexed cancelledBy);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    address public admin;
    address public pendingAdmin;

    /// @notice [V7-L5] Stored as public immutable for post-deployment verification.
    ///         Visible on Basescan — confirms mainnet admin check was enforced at deploy.
    bool public immutable IS_MAINNET;

    bool public selfServeEnabled;

    /// @notice Live whitelist. true = currently approved.
    mapping(address => bool) public approvedMerchants;

    /// @notice Permanent blacklist.
    mapping(address => bool) public blacklistedMerchants;

    /// @notice [MR-02] Tracks last self-registration timestamp per address.
    ///         Enforces SELF_REGISTER_COOLDOWN between self-registrations.
    mapping(address => uint256) public lastSelfRegisteredAt;

    /// @notice Historical list for off-chain enumeration.
    ///         IMPORTANT: Presence here does NOT mean currently approved.
    ///         Always check approvedMerchants[addr] for live status.
    ///         [MR-04] Contains historical entries including revoked merchants.
    address[] private _merchantList;
    mapping(address => bool) private _everApproved;

    /// @notice [MR-04] Live count of currently approved merchants. O(1).
    ///         Incremented on approve, decremented on revoke.
    uint256 private _approvedMerchantCount;

    // -------------------------------------------------------------------------
    // Modifier
    // -------------------------------------------------------------------------

    modifier onlyAdmin() {
        require(msg.sender == admin, "Registry: not admin");
        _;
    }

    // -------------------------------------------------------------------------
    // Constructor
    // -------------------------------------------------------------------------

    /// @param _admin   Initial admin address.
    /// @param _isMainnet  Pass true on mainnet — enforces admin must be a contract.
    ///                    Pass false on testnet — allows EOA admin for development.
    ///                    [MR-01] Replaces the commented-out require() in v2.
    ///                    deploy.js sets this from Hardhat network config.
    constructor(address _admin, bool _isMainnet) {
        require(_admin != address(0), "Registry: zero address");

        // [MR-01] On mainnet: admin MUST be a deployed contract (Safe multisig).
        // On testnet: EOA admin is permitted for development convenience.
        // This flag is set by deploy.js based on the Hardhat network target.
        // Mainnet deploy.js: new MerchantRegistry(safeAddress, true)
        // Sepolia deploy.js: new MerchantRegistry(deployerAddress, false)
        if (_isMainnet) {
            require(
                _admin.code.length > 0,
                "Registry: mainnet admin must be a contract (Safe multisig)"
            );
        }

        // [V7-L5] Store flag as immutable for on-chain verifiability.
        IS_MAINNET       = _isMainnet;
        admin            = _admin;
        selfServeEnabled = false;

        emit ProtocolDeployed(
            PROTOCOL, VERSION, msg.sender, _admin, block.chainid, block.timestamp
        );
    }

    // -------------------------------------------------------------------------
    // Merchant Registration
    // -------------------------------------------------------------------------

    /// @notice Admin approves a merchant (invite-only flow).
    ///         Idempotent — approving an already-approved address is a no-op.
    function approveMerchant(address merchant) external onlyAdmin {
        require(merchant != address(0), "Registry: zero address");
        _approve(merchant, msg.sender);
    }

    /// @notice Any wallet self-registers when selfServeEnabled = true.
    ///         [MR-02] Enforces SELF_REGISTER_COOLDOWN (1 hour) between registrations.
    ///         Emits MerchantSelfRegistered (distinct from admin MerchantApproved).
    function selfRegister() external {
        require(selfServeEnabled, "Registry: invite only");
        require(
            block.timestamp >= lastSelfRegisteredAt[msg.sender] + SELF_REGISTER_COOLDOWN,
            "Registry: self-register cooldown active"
        );
        lastSelfRegisteredAt[msg.sender] = block.timestamp;
        _approve(msg.sender, msg.sender);
        emit MerchantSelfRegistered(msg.sender);
    }

    /// @notice Admin revokes a merchant.
    ///         Existing subscriptions continue — only new ones are blocked.
    function revokeMerchant(address merchant) external onlyAdmin {
        require(approvedMerchants[merchant], "Registry: not approved");
        approvedMerchants[merchant] = false;
        _approvedMerchantCount--;
        emit MerchantRevoked(merchant, msg.sender);
    }

    /// @notice Admin permanently blacklists a merchant.
    ///         Blacklisted merchants cannot re-register even if self-serve is on.
    ///         Also revokes if currently approved.
    ///         [V7-L2/L3] Cannot blacklist current admin or pending admin —
    ///                    prevents inconsistent state where the protocol admin
    ///                    is permanently banned from merchant approval.
    function blacklistMerchant(address merchant) external onlyAdmin {
        require(merchant != address(0),   "Registry: zero address");
        require(merchant != admin,        "Registry: cannot blacklist admin");
        require(merchant != pendingAdmin, "Registry: cannot blacklist pending admin");
        require(!blacklistedMerchants[merchant], "Registry: already blacklisted");
        blacklistedMerchants[merchant] = true;
        if (approvedMerchants[merchant]) {
            approvedMerchants[merchant] = false;
            _approvedMerchantCount--;
            emit MerchantRevoked(merchant, msg.sender);
        }
        emit MerchantBlacklisted(merchant, msg.sender);
    }

    /// @notice Admin approves multiple merchants in one transaction.
    ///         [MR-03] skipBlacklisted param: if true, blacklisted addresses are skipped
    ///                 silently. If false, reverts on any blacklisted address (original
    ///                 behaviour — safer for intentional batch approvals).
    function batchApproveMerchants(
        address[] calldata merchants,
        bool skipBlacklisted
    ) external onlyAdmin {
        require(merchants.length <= 100, "Registry: batch too large");
        for (uint256 i = 0; i < merchants.length; i++) {
            require(merchants[i] != address(0), "Registry: zero address in batch");
            if (skipBlacklisted && blacklistedMerchants[merchants[i]]) continue;
            _approve(merchants[i], msg.sender);
        }
    }

    /// @notice Admin revokes multiple merchants in one transaction.
    function batchRevokeMerchants(address[] calldata merchants) external onlyAdmin {
        require(merchants.length <= 100, "Registry: batch too large");
        for (uint256 i = 0; i < merchants.length; i++) {
            if (approvedMerchants[merchants[i]]) {
                approvedMerchants[merchants[i]] = false;
                _approvedMerchantCount--;
                emit MerchantRevoked(merchants[i], msg.sender);
            }
        }
    }

    // -------------------------------------------------------------------------
    // Self-Serve Toggle
    // -------------------------------------------------------------------------

    function setSelfServe(bool enabled) external onlyAdmin {
        require(selfServeEnabled != enabled, "Registry: no state change");
        selfServeEnabled = enabled;
        emit SelfServeUpdated(enabled, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Read Helpers
    // -------------------------------------------------------------------------

    /// @notice Primary gate called by SubscriptionVault.createSubscription().
    function isApproved(address merchant) external view returns (bool) {
        return approvedMerchants[merchant];
    }

    /// @notice Total addresses ever approved (including revoked).
    ///         [MR-04] Use with getMerchantAt() for dashboard pagination.
    ///         Does NOT equal the count of currently approved merchants.
    ///         Use approvedMerchantCount() for the live approved count.
    function merchantCount() external view returns (uint256) {
        return _merchantList.length;
    }

    /// @notice [MR-04] Count of currently approved (non-revoked) merchants. O(1).
    function approvedMerchantCount() external view returns (uint256) {
        return _approvedMerchantCount;
    }

    /// @notice Fetch merchant address by historical index.
    ///         Pair with approvedMerchants[] to check current status.
    function getMerchantAt(uint256 index) external view returns (address) {
        require(index < _merchantList.length, "Registry: out of bounds");
        return _merchantList[index];
    }

    /// @notice [MR-04] Paginated merchant list for dashboard.
    ///         Returns a slice of the historical _merchantList.
    ///         Callers must filter by approvedMerchants[addr] for live status.
    /// @param offset  Starting index (0-based).
    /// @param limit   Maximum number of addresses to return (max 200).
    function getMerchantsPage(
        uint256 offset,
        uint256 limit
    ) external view returns (address[] memory page, uint256 total) {
        require(limit <= 200, "Registry: limit too large");
        total = _merchantList.length;
        if (offset >= total) return (new address[](0), total);
        uint256 end = offset + limit;
        if (end > total) end = total;
        page = new address[](end - offset);
        for (uint256 i = offset; i < end; i++) {
            page[i - offset] = _merchantList[i];
        }
    }

    // -------------------------------------------------------------------------
    // Two-Step Admin Transfer
    // -------------------------------------------------------------------------

    function proposeAdminTransfer(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Registry: zero address");
        require(newAdmin != admin,      "Registry: already admin");
        if (pendingAdmin != address(0)) {
            emit AdminTransferCancelled(msg.sender);
        }
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    function acceptAdminTransfer() external {
        require(msg.sender == pendingAdmin, "Registry: not pending admin");
        address old  = admin;
        admin        = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(old, admin);
    }

    function cancelAdminTransfer() external onlyAdmin {
        require(pendingAdmin != address(0), "Registry: no pending transfer");
        pendingAdmin = address(0);
        emit AdminTransferCancelled(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _approve(address merchant, address approvedBy) internal {
        require(!blacklistedMerchants[merchant], "Registry: merchant blacklisted");

        if (approvedMerchants[merchant]) return; // Idempotent

        // [V7-C2] Use _approvedMerchantCount for cap — _merchantList.length includes
        //         revoked merchants and would incorrectly consume cap slots for them.
        require(_approvedMerchantCount < MAX_MERCHANTS, "Registry: merchant limit reached");

        approvedMerchants[merchant] = true;
        _approvedMerchantCount++;

        if (!_everApproved[merchant]) {
            _everApproved[merchant] = true;
            _merchantList.push(merchant);
        }

        emit MerchantApproved(merchant, approvedBy);
    }
}
