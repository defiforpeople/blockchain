//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IStrategy {
    function getQuotaQty(address tokenAddr, uint256 amount)
        external
        view
        returns (uint256);

    function getQuotaPrice() external view returns (uint256);
}
