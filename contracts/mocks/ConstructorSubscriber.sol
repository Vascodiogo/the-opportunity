// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

import "../SubscriptionVault.sol";

/// @notice Reproduces the pre-SV-19 constructor-bypass pattern: calls
/// createSubscription() from inside its own constructor, when
/// extcodesize(address(this)) is still 0. Used to prove the SV-19 live
/// recheck in executePull() actually closes the gap. Not used in production —
/// test harness only.
contract ConstructorSubscriber {
    address public owner;
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;

    constructor(
        SubscriptionVault vault,
        address owner_,
        address merchant,
        address token,
        uint256 amount
    ) {
        owner = owner_;

        // At this point extcodesize(address(this)) == 0 — this is the exact
        // bypass window SV-19 closes at pull time.
        vault.createSubscription(
            merchant,
            address(this),
            token,
            amount,
            0,                                    // introAmount
            0,                                    // introPulls
            SubscriptionVault.Interval.Weekly,
            address(0),                           // guardian
            0,                                    // trialDays
            0,                                    // gracePeriodDays_ (default)
            bytes32(0)                            // dataVaultId_
        );
    }

    function isValidSignature(bytes32 hash, bytes memory signature)
        external
        view
        returns (bytes4)
    {
        if (signature.length != 65) return 0xffffffff;
        bytes32 r;
        bytes32 s;
        uint8 v;
        assembly {
            r := mload(add(signature, 32))
            s := mload(add(signature, 64))
            v := byte(0, mload(add(signature, 96)))
        }
        address recovered = ecrecover(hash, v, r, s);
        return recovered == owner ? ERC1271_MAGIC : bytes4(0xffffffff);
    }

    function approveSpender(address token, address spender, uint256 amount) external {
        require(msg.sender == owner, "NotOwner");
        (bool ok, ) = token.call(abi.encodeWithSignature("approve(address,uint256)", spender, amount));
        require(ok, "ApproveFailed");
    }
}
