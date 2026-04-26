// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// =============================================================================
//  MerchantRegistry.sol — AuthOnce Protocol
//  "The Guest List" — invite-only merchant whitelist
//
//  Network:    Base Sepolia (testnet)
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//              (matches SubscriptionVault.sol — CLAUDE.md §2)
//  Admin:      0x44444D60136Cf62804963fA14d62a55c34a96f8F (testnet)
//
//  CLAUDE.md rules implemented:
//   §3.8  — invite-only; only admin can approve or revoke merchants
//   §3.10 — MerchantApproved / MerchantRevoked events emitted on every change
//   §7    — no upgradeability; two-step admin transfer to prevent key loss
//
//  Read by SubscriptionVault.createSubscription() via isApproved().
//  Revoked merchants cannot receive NEW subscriptions; existing active
//  subscriptions continue until the subscriber cancels (CLAUDE.md §3.8).
//
//  License: Business Source License 1.1
//  © 2026 Vasco Humberto dos Reis Diogo. All Rights Reserved.
//  https://authonce.io
// =============================================================================

contract MerchantRegistry {

    // -------------------------------------------------------------------------
    // Watermark — origin proof baked into bytecode forever
    // -------------------------------------------------------------------------

    string public constant PROTOCOL      = "AuthOnce Protocol";
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_REPO   = "github.com/Vascodiogo/the-opportunity";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

    // -------------------------------------------------------------------------
    // Events — CLAUDE.md §3.10 (on-chain audit trail)
    // -------------------------------------------------------------------------

    /// @notice Emitted once at deployment — used by monitor.js to detect copies.
    event ProtocolDeployed(
        string  protocol,
        string  version,
        address indexed deployer,
        uint256 chainId,
        uint256 timestamp
    );

    event MerchantApproved(address indexed merchant, address indexed approvedBy);
    event MerchantRevoked(address indexed merchant, address indexed revokedBy);
    event AdminTransferProposed(address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferAccepted(address indexed oldAdmin, address indexed newAdmin);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Protocol admin — use a multisig on mainnet (CLAUDE.md §7).
    address public admin;

    /// @notice Pending admin for two-step transfer. Zero if none pending.
    address public pendingAdmin;

    /// @notice Live whitelist. true = currently approved merchant.
    mapping(address => bool) public approvedMerchants;

    /// @notice Historical list for off-chain enumeration (dashboard pagination).
    /// @dev    Presence here does NOT mean currently approved.
    ///         Always check approvedMerchants[addr] for live status.
    address[] private _merchantList;
    mapping(address => bool) private _everApproved;

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

    /// @param _admin Initial admin address.
    ///               Deployer EOA is fine for testnet.
    ///               Must be a Safe multisig before mainnet.
    constructor(address _admin) {
        require(_admin != address(0), "Registry: zero address");
        admin = _admin;

        emit ProtocolDeployed(
            PROTOCOL,
            "1.0.0",
            msg.sender,
            block.chainid,
            block.timestamp
        );
    }

    // -------------------------------------------------------------------------
    // Merchant Management — admin only
    // -------------------------------------------------------------------------

    /// @notice Add a merchant to the whitelist.
    /// @dev    Idempotent — approving an already-approved address returns
    ///         silently without reverting or emitting a duplicate event.
    function approveMerchant(address merchant) external onlyAdmin {
        require(merchant != address(0), "Registry: zero address");
        if (approvedMerchants[merchant]) return;

        approvedMerchants[merchant] = true;

        if (!_everApproved[merchant]) {
            _everApproved[merchant] = true;
            _merchantList.push(merchant);
        }

        emit MerchantApproved(merchant, msg.sender);
    }

    /// @notice Remove a merchant from the whitelist.
    /// @dev    Existing subscriptions are NOT cancelled — only new ones
    ///         are blocked (CLAUDE.md §3.8).
    function revokeMerchant(address merchant) external onlyAdmin {
        require(approvedMerchants[merchant], "Registry: not approved");
        approvedMerchants[merchant] = false;
        emit MerchantRevoked(merchant, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Read Helpers — called by SubscriptionVault and the dashboard
    // -------------------------------------------------------------------------

    /// @notice Primary gate called by SubscriptionVault.createSubscription().
    function isApproved(address merchant) external view returns (bool) {
        return approvedMerchants[merchant];
    }

    /// @notice Total addresses ever approved (including revoked).
    ///         Use with getMerchantAt() for pagination.
    function merchantCount() external view returns (uint256) {
        return _merchantList.length;
    }

    /// @notice Fetch merchant address by index. Pair with approvedMerchants[]
    ///         to check current status.
    function getMerchantAt(uint256 index) external view returns (address) {
        require(index < _merchantList.length, "Registry: out of bounds");
        return _merchantList[index];
    }

    // -------------------------------------------------------------------------
    // Two-Step Admin Transfer — CLAUDE.md §7 (key safety)
    // -------------------------------------------------------------------------

    /// @notice Step 1 — current admin nominates a successor.
    function proposeAdminTransfer(address newAdmin) external onlyAdmin {
        require(newAdmin != address(0), "Registry: zero address");
        require(newAdmin != admin,      "Registry: already admin");
        pendingAdmin = newAdmin;
        emit AdminTransferProposed(admin, newAdmin);
    }

    /// @notice Step 2 — nominated address accepts and becomes admin.
    function acceptAdminTransfer() external {
        require(msg.sender == pendingAdmin, "Registry: not pending admin");
        address old = admin;
        admin        = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(old, admin);
    }

    /// @notice Cancel a pending nomination. Only current admin.
    function cancelAdminTransfer() external onlyAdmin {
        require(pendingAdmin != address(0), "Registry: no pending transfer");
        pendingAdmin = address(0);
    }
}
