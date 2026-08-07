// SPDX-License-Identifier: MIT
pragma solidity 0.8.24;

/// @notice Minimal 6-decimal ERC20 for testing SubscriptionVault. Not used in
/// production — test harness only.
contract MockERC20 {
    string public name = "Mock USDC";
    string public symbol = "mUSDC";
    uint8  public decimals_ = 6;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    function decimals() external view returns (uint8) {
        return decimals_;
    }

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "InsufficientBalance");
        if (msg.sender != from) {
            uint256 allowed = allowance[from][msg.sender];
            require(allowed >= amount, "InsufficientAllowance");
            if (allowed != type(uint256).max) {
                allowance[from][msg.sender] = allowed - amount;
            }
        }
        balanceOf[from] -= amount;
        balanceOf[to]   += amount;
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "InsufficientBalance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to]         += amount;
        return true;
    }
}
