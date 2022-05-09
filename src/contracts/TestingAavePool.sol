// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IERC20} from "openzeppelin-solidity/contracts/interfaces/IERC20.sol";

contract TestingAavePool {
    IPool public pool;

    constructor(address _pool) public {
        pool = IPool(_pool);
    }

    function supplyLiquidity(uint256 _amount, address _token) public payable {
        IERC20(_token).transferFrom(msg.sender, address(this), _amount);

        pool.supply(_token, _amount, address(this), 0);
    }

    function getUser(address _user)
        external
        view
        returns (DataTypes.UserConfigurationMap memory)
    {
        return pool.getUserConfiguration(_user);
    }
}
