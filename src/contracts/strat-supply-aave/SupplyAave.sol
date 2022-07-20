// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

// errors
error Error__NotEnoughBalance(uint256 balance, uint256 depositAmount);
error Error__NotEnoughAllowance(uint256 allowance, uint256 depositAmount);
error Error__NotEnoughLP(uint256 lpAmount);
error Error__AmountIsZero();
error Error__InvalidToken(address token);

contract SupplyAave {
    // events
    event Deposit(address indexed userAddr, uint256 amount);
    event Withdraw(address indexed userAddr, uint256 amount);

    IPool public immutable AAVE_POOL;
    uint16 public immutable AAVE_REF_CODE;

    constructor(address aavePool, uint16 aaveRefCode) {
        AAVE_POOL = IPool(aavePool);
        AAVE_REF_CODE = aaveRefCode;
    }

    // modifier that checks amount is not zero
    modifier checkAmount(uint256 amount) {
        if (amount == 0) {
            revert Error__AmountIsZero();
        }
        _;
    }

    // method for supplying tokens to Aave pool, with user permittion
    function deposit(
        uint256 amount,
        address tokenAddr,
        uint256 deadline,
        uint8 permitV,
        bytes32 permitR,
        bytes32 permitS
    ) external checkAmount(amount) {
        IERC20 token = IERC20(tokenAddr);

        // check that user give enoguh allowance to the contract for supplying the token
        if (
            token.allowance(msg.sender, address(this)) == 0 ||
            token.allowance(msg.sender, address(this)) < amount
        ) {
            revert Error__NotEnoughAllowance(
                token.allowance(msg.sender, address(this)),
                amount
            );
        }

        // check that user has enough balance to supply the token
        if (token.balanceOf(msg.sender) < amount || amount == 0) {
            revert Error__NotEnoughBalance(token.balanceOf(msg.sender), amount);
        }

        // supply tokens to Aave pool
        AAVE_POOL.supplyWithPermit(
            (address(token)),
            amount,
            address(this),
            AAVE_REF_CODE,
            deadline,
            permitV,
            permitR,
            permitS
        );

        emit Deposit(msg.sender, amount);
    }

    // method for withdraw tokens from Aave pool, to user's address
    function withdraw(uint256 lpAmount, address tokenAddr)
        external
        checkAmount(lpAmount)
    {
        IERC20 token = IERC20(tokenAddr);

        // check that user has enough LP to withdraw
        if (token.balanceOf(msg.sender) < lpAmount || lpAmount == 0) {
            revert Error__NotEnoughBalance(
                token.balanceOf(msg.sender),
                lpAmount
            );
        }

        // withdraw token lpAmount from aave, to the userAddr
        AAVE_POOL.withdraw(address(token), lpAmount, msg.sender);

        emit Withdraw(msg.sender, lpAmount);
    }
}
