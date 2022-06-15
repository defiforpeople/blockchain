//SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

// Token done for test purpose only
contract DFP is ERC20 {
    constructor() ERC20("DeFi For People Token", "DFP") {}

    function mint(address _to, uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");

        _mint(_to, _amount);
    }
}
