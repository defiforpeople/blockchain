//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";

contract Greeter {
    string private greeting;
    address private aavePoolAddr;

    constructor(string memory _greeting, address _aavePoolAddr) {
        console.log("Deploying a Greeter with greeting:", _greeting);
        greeting = _greeting;
        aavePoolAddr = _aavePoolAddr;
    }

    function greet() public view returns (string memory) {
        return greeting;
    }

    function setGreeting(string memory _greeting) public {
        console.log("Changing greeting from '%s' to '%s'", greeting, _greeting);
        greeting = _greeting;
    }

    function getUser(address _user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {
        return IPool(aavePoolAddr).getUserAccountData(_user);
    }
}
