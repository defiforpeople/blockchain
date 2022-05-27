// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {IStrategy} from "./IStrategy.sol";

contract Strategy is IStrategy {
    constructor() {}

    event Deposit(address indexed userAddr, uint256 amount, uint256 quotas);
    event Withdraw(address indexed userAddr, uint256 amount, uint256 quotas);

    function deposit(uint256 amount) external {
        emit Deposit(msg.sender, amount, amount);
    }

    function withdraw(uint256 amount) external {
        emit Withdraw(msg.sender, amount, amount);
    }

    function getQuotaQty(uint256 amount) external view returns (uint256) {
        uint256 qty = amount;
        return qty;
    }

    function getQuotaPrice() external view returns (uint256) {
        return 1;
    }
}
