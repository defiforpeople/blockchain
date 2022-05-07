// SPDX-License-Identifier: MIT
pragma solidity ^0.8.9;

// // import { Pool } from "@aave/contracts/protocol/pool/Pool.sol";
// // import {IPool} from "@aave/contracts/interfaces/IPool.sol";
// import {IERC20} from "../interfaces/IERC20.sol";

// // import {DataTypes} from "@aave/contracts/protocol/libraries/types/DataTypes.sol";

// contract TestingAavePool {
//     IPool public pool;

//     constructor(address _pool) public {
//         pool = IPool(_pool);
//     }

//     function supplyLiquidity(uint256 _amount, address _token) public payable {
//         IERC20(_token).transferFrom(msg.sender, address(this), _amount);

//         pool.supply(_token, _amount, address(this), 0);
//     }

//     // function borrow()

//     function getUser(address _user)
//         external
//         view
//         returns (DataTypes.UserConfigurationMap memory)
//     {
//         return pool.getUserConfiguration(_user);
//     }
// }
