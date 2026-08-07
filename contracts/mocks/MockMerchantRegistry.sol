// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal MerchantRegistry stand-in for isolated SubscriptionVault
/// testing. Not used in production — test harness only. The real
/// MerchantRegistry.sol has its own test suite; this mock lets us test
/// SubscriptionVault's v8 patches without needing the full registry deployed.
contract MockMerchantRegistry {
    mapping(address => bool) public approved;

    function setApproved(address merchant, bool value) external {
        approved[merchant] = value;
    }

    function isApproved(address merchant) external view returns (bool) {
        return approved[merchant];
    }
}
