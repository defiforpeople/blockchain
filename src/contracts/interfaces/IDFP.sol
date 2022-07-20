//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// Token done for test purpose only
interface IDFP is IERC20 {
    function mint(address _to, uint256 _amount) external;
}
