// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal ERC-1271 smart wallet for testing. Verifies signatures via
/// raw ecrecover against a fixed owner key. Not used in production — test
/// harness only.
contract TestWallet {
    address public owner;
    bytes4 internal constant ERC1271_MAGIC = 0x1626ba7e;

    constructor(address owner_) {
        owner = owner_;
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

    /// @notice Relay arbitrary calls as this wallet — lets a test drive
    /// createSubscription/acceptSafeVaultChange/etc with msg.sender == this wallet.
    function forward(address target, bytes calldata data) external payable returns (bytes memory) {
        require(msg.sender == owner, "NotOwner");
        (bool ok, bytes memory ret) = target.call{value: msg.value}(data);
        require(ok, string(ret.length > 0 ? ret : bytes("ForwardFailed")));
        return ret;
    }
}
