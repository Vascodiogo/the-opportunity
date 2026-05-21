// SPDX-License-Identifier: BUSL-1.1
pragma solidity ^0.8.24;

// =============================================================================
//  MerchantRegistry.sol — AuthOnce Protocol v2
//  "The Guest List"
//
//  Network:    Base Sepolia (testnet) / Base Mainnet
//  Compiler:   Solidity v0.8.24, optimizer: true, 200 runs,
//              viaIR: true, evmVersion: paris
//
//  Changes from v1:
//    - selfServeEnabled toggle: admin can open registration to any wallet.
//      Off by default. Designed for post-launch when protocol is proven.
//      When enabled, any wallet can self-approve. Admin can still revoke.
//    - Two-step admin transfer already existed in v1 — preserved as-is.
//    - VERSION constant added.
//    - isApproved() remains the single interface point for SubscriptionVault.
//
//  Invite-only is the launch posture. selfServeEnabled = false at deploy.
//  Admin flips it via setSelfServe(true) when ready for open registration.
//
//  Read by SubscriptionVault.createSubscription() via isApproved().
//  Revoked merchants cannot receive new subscriptions. Existing active
//  subscriptions continue until the subscriber cancels.
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
    string public constant VERSION       = "2.0.0";
    string public constant ORIGIN_DOMAIN = "authonce.io";
    string public constant ORIGIN_REPO   = "github.com/Vascodiogo/the-opportunity";
    string public constant ORIGIN_AUTHOR = "Vasco Humberto dos Reis Diogo";
    string public constant LICENSE_SPDX  = "BUSL-1.1";

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

    event MerchantApproved(address indexed merchant, address indexed approvedBy);
    event MerchantRevoked(address indexed merchant, address indexed revokedBy);
    event SelfServeEnabled(address indexed enabledBy);
    event SelfServeDisabled(address indexed disabledBy);
    event AdminTransferProposed(address indexed currentAdmin, address indexed proposedAdmin);
    event AdminTransferAccepted(address indexed oldAdmin, address indexed newAdmin);
    event AdminTransferCancelled(address indexed cancelledBy);

    // -------------------------------------------------------------------------
    // Storage
    // -------------------------------------------------------------------------

    /// @notice Protocol admin — Safe multisig on mainnet.
    address public admin;

    /// @notice Pending admin for two-step transfer. Zero if none pending.
    address public pendingAdmin;

    /// @notice When true, any wallet can self-register as a merchant.
    ///         Off at deploy (invite-only). Admin flips post-launch.
    bool public selfServeEnabled;

    /// @notice Live whitelist. true = currently approved.
    mapping(address => bool) public approvedMerchants;

    /// @notice Historical list for off-chain enumeration and dashboard pagination.
    ///         Presence here does NOT mean currently approved.
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
        admin            = _admin;
        selfServeEnabled = false; // Invite-only at launch

        emit ProtocolDeployed(
            PROTOCOL,
            VERSION,
            msg.sender,
            block.chainid,
            block.timestamp
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
    ///         Reverts when in invite-only mode.
    function selfRegister() external {
        require(selfServeEnabled, "Registry: invite only");
        require(msg.sender != address(0), "Registry: zero address");
        _approve(msg.sender, msg.sender);
    }

    /// @notice Admin revokes a merchant.
    ///         Existing subscriptions continue — only new ones are blocked.
    function revokeMerchant(address merchant) external onlyAdmin {
        require(approvedMerchants[merchant], "Registry: not approved");
        approvedMerchants[merchant] = false;
        emit MerchantRevoked(merchant, msg.sender);
    }

    // -------------------------------------------------------------------------
    // Self-Serve Toggle — admin only
    // -------------------------------------------------------------------------

    /// @notice Open or close self-registration.
    ///         setSelfServe(true)  — any wallet can register.
    ///         setSelfServe(false) — back to invite-only.
    function setSelfServe(bool enabled) external onlyAdmin {
        selfServeEnabled = enabled;
        if (enabled) {
            emit SelfServeEnabled(msg.sender);
        } else {
            emit SelfServeDisabled(msg.sender);
        }
    }

    // -------------------------------------------------------------------------
    // Read Helpers — called by SubscriptionVault and the dashboard
    // -------------------------------------------------------------------------

    /// @notice Primary gate called by SubscriptionVault.createSubscription().
    function isApproved(address merchant) external view returns (bool) {
        return approvedMerchants[merchant];
    }

    /// @notice Total addresses ever approved (including revoked).
    ///         Use with getMerchantAt() for dashboard pagination.
    function merchantCount() external view returns (uint256) {
        return _merchantList.length;
    }

    /// @notice Fetch merchant address by index.
    ///         Pair with approvedMerchants[] to check current status.
    function getMerchantAt(uint256 index) external view returns (address) {
        require(index < _merchantList.length, "Registry: out of bounds");
        return _merchantList[index];
    }

    // -------------------------------------------------------------------------
    // Two-Step Admin Transfer
    // Prevents permanent loss of admin from a typo or compromised key.
    // Step 1: current admin proposes a successor.
    // Step 2: successor accepts from their own wallet.
    // Either party can cancel before acceptance.
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
        address old  = admin;
        admin        = pendingAdmin;
        pendingAdmin = address(0);
        emit AdminTransferAccepted(old, admin);
    }

    /// @notice Cancel a pending nomination. Current admin only.
    function cancelAdminTransfer() external onlyAdmin {
        require(pendingAdmin != address(0), "Registry: no pending transfer");
        pendingAdmin = address(0);
        emit AdminTransferCancelled(msg.sender);
    }

    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------

    function _approve(address merchant, address approvedBy) internal {
        if (approvedMerchants[merchant]) return; // Idempotent

        approvedMerchants[merchant] = true;

        if (!_everApproved[merchant]) {
            _everApproved[merchant] = true;
            _merchantList.push(merchant);
        }

        emit MerchantApproved(merchant, approvedBy);
    }
}
