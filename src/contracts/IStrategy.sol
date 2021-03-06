//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

interface IStrategy {
    function getQuotaQty(uint256 amount) external view returns (uint256);

    function getQuotaPrice() external view returns (uint256);

    // function getUserQuotas(address userAddr) external view returns (uint256);
}
