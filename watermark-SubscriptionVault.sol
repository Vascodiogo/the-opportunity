// ============================================================
//  ADD THESE LINES to SubscriptionVault.sol
//  Place immediately after the opening of the contract body,
//  before any existing storage variables.
// ============================================================

// SPDX-License-Identifier: BUSL-1.1  ← change from MIT to BUSL-1.1

// -----------------------------------------------------------
// Watermark — origin proof baked into bytecode forever
// -----------------------------------------------------------
string public constant PROTOCOL        = "AuthOnce Protocol";
string public constant ORIGIN_DOMAIN   = "authonce.io";
string public constant ORIGIN_REPO     = "github.com/Vascodiogo/the-opportunity";
string public constant ORIGIN_AUTHOR   = "Vasco Humberto dos Reis Diogo";
string public constant LICENSE_SPDX    = "BUSL-1.1";

// -----------------------------------------------------------
// Deployment tracking event
// Fires once in the constructor — captured by monitor.js
// -----------------------------------------------------------
event ProtocolDeployed(
    string  protocol,
    string  version,
    address indexed deployer,
    uint256 chainId,
    uint256 timestamp
);

// -----------------------------------------------------------
// ADD THIS inside your constructor, as the very first line:
// -----------------------------------------------------------
//
//  constructor(...) {
//      emit ProtocolDeployed(
//          PROTOCOL,
//          "1.0.0",
//          msg.sender,
//          block.chainid,
//          block.timestamp
//      );
//      // ... rest of your existing constructor logic
//  }
//
// ============================================================
