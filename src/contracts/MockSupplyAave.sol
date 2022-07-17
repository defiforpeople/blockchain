// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

contract MockSupplyAave {
    // events
    event Deposit(address indexed userAddr, uint256 amount);
    event Withdraw(address indexed userAddr, uint256 amount);

    constructor() {}

    // method for supplying tokens to Aave pool, with user permittion
    function deposit(uint256 amount) external {
        emit Deposit(msg.sender, amount);
    }

    // method for withdraw tokens from Aave pool, to user's address
    function withdraw(uint256 lpAmount) external {
        emit Withdraw(msg.sender, lpAmount);
    }
}
