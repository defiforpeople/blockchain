// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IStrategy} from "./IStrategy.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IWETH} from "@aave/core-v3/contracts/misc/interfaces/IWETH.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {LinkTokenInterface} from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

contract StrategyRecursiveFarming is Pausable, Ownable, IStrategy {
    // interfaces
    IERC20 public token;
    IPool private aavePool;
    AggregatorV3Interface private gasPriceFeed;
    LinkTokenInterface public link;

    // internal
    uint256 private investmentAmount;
    StrategyStatus private status;
    // uint256 private quotaPrice;

    // constants
    uint256 private constant GAS_USED_DEPOSIT = 0;
    uint256 private constant GAS_USED_SUPPLY = 0;
    uint256 private constant GAS_USED_BORROW = 0;
    uint256 private constant GAS_PRICE_MULTIPLIER = 3;
    uint256 private constant LINK_USED_CALL = 0;
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always variable
    uint16 private constant AAVE_REF_CODE = 0;

    constructor(
        address _aavePoolAddr,
        address _gasPriceFeedAddr,
        address _wavaxAddr,
        address _linkAddr
    ) {
        aavePool = IPool(_aavePoolAddr);
        gasPriceFeed = AggregatorV3Interface(_gasPriceFeedAddr);
        token = IERC20(_wavaxAddr);
        link = LinkTokenInterface(_linkAddr);
    }

    // define investments information
    mapping(address => uint256) public _investments;

    // status that marks the next step to do in the strategy for keeper
    enum StrategyStatus {
        Borrow,
        Supply,
        Done
    }

    // events for Deposit and Withdraw funcitons
    event Deposit(address indexed userAddr, uint256 amount);
    event Withdraw(address indexed userAddr, uint256 amount);

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 amount) external {
        console.log("DEPOSIT INSIDE CONTRACT");
        // transfer the user amount to this contract (user has to approve before this)
        token.transferFrom(msg.sender, address(this), amount);

        // save investments in the mapping
        _investments[msg.sender] += amount;

        // approve and supply liquidity to the protocol
        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), AAVE_REF_CODE);

        // update the status of the strategy to the next step to do
        status = StrategyStatus.Borrow;

        // emit Deposit event
        emit Deposit(msg.sender, amount);
    }

    function borrow() public {
        // get the max available amount ofr borrowing
        (, , uint256 borrowAvailable, , , ) = aavePool.getUserAccountData(
            address(this)
        );

        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // if the amount is not enough for continuing with the execution, the status will be Done and the exec'll be finished
        if (
            borrowAvailable <
            (GAS_USED_DEPOSIT + GAS_USED_SUPPLY) *
                uint256(gasPrice) *
                GAS_PRICE_MULTIPLIER
        ) {
            status = StrategyStatus.Supply;
            return;
        }
        // otherwise, it will continue with the execution flow

        // method for borrow in Aave
        aavePool.borrow(
            address(token),
            borrowAvailable,
            INTEREST_RATE_MODE,
            AAVE_REF_CODE,
            address(this)
        );

        // update status to the Supply (amount borrowed), that is the next step to do
        status = StrategyStatus.Supply;
    }

    function supply() internal {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // if the amount is not enough for continuing with the execution, the status will be Done and the exec'll be finished
        if (
            token.balanceOf(address(this)) <
            GAS_USED_DEPOSIT * uint256(gasPrice) * GAS_PRICE_MULTIPLIER
        ) {
            status = StrategyStatus.Done;
            return;
        }
        // otherwise, it will continue with the execution flow

        // the var amount will contain the WAVAX of the contract(what we borrowed before)
        uint256 amount = token.balanceOf(address(this));

        // approve and supply liquidity
        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), AAVE_REF_CODE);

        // update status to done, because the loop has finished
        status = StrategyStatus.Done;
    }

    // this method returns the status of the strategy
    function viewStatus() external view onlyOwner returns (StrategyStatus) {
        return status;
    }

    // method for executing the recursive loop based on the status of the strategy
    function doRecursion() external onlyOwner {
        require(status != StrategyStatus.Done, "The strategy is completed");
        if (status == StrategyStatus.Borrow) {
            borrow();
        } else if (status == StrategyStatus.Supply) {
            supply();
        }
    }

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 amount) external {
        // check if user has requested amount
        require(
            _investments[msg.sender] > 0 && _investments[msg.sender] >= amount,
            "No balance for requested amount"
        );

        // TODO(nb): implement correctly the quotas calc flow and get the quota price for calc the amount to withdraw
        // quotaPrice = getCuotaPrice();

        // repay the Aave loan with collateral
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);

        // rest the amount repayed of investments
        _investments[msg.sender] -= amount;

        // update the status of strategy for the next step needed
        emit Withdraw(msg.sender, amount);
    }

    // method for withdraw and transfer tokens to the users
    function withdraw(address userAdrr, uint256 amount) external onlyOwner {
        aavePool.withdraw(address(token), amount, userAdrr);
    }

    function getQuotaQty(address tokenAddr, uint256 amount)
        external
        view
        returns (uint256)
    {
        uint256 qty = amount; //  / getCuotaPrice();
        return qty;
    }

    function getQuotaPrice() external view returns (uint256) {
        return 0;
    }

    // method for returning if the wallet that'll execute has enough GAS in order to complete a loop
    function gasNeeded() external view onlyOwner returns (uint256) {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        if (
            address(msg.sender).balance <
            GAS_USED_BORROW +
                GAS_USED_DEPOSIT *
                uint256(gasPrice) *
                GAS_PRICE_MULTIPLIER
        ) {
            // if has enough balance, it will return 0 as gasNeeded
            return 0;
        }

        // if it hasn't enough balance, it'll return the minimun gas needed for executing a loop
        return
            (GAS_USED_BORROW +
                GAS_USED_DEPOSIT *
                uint256(gasPrice) *
                GAS_PRICE_MULTIPLIER) - address(msg.sender).balance;
    }

    // method for returning if the contarct has enough LINK in order to call the data feeds
    function linkNeeded() external view onlyOwner returns (uint256) {
        if (link.balanceOf(address(this)) < LINK_USED_CALL) {
            return 0; // if has enough LINK, it will return 0 as linkNeeded
        }

        // if it hasn't enough balance, it'll return the minimun LINK needed for executing the data feeds
        return LINK_USED_CALL - link.balanceOf(address(this));
    }
}
