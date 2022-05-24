// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

// import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IStrategy} from "./IStrategy.sol";
import "hardhat/console.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IWETH} from "@aave/core-v3/contracts/misc/interfaces/IWETH.sol";

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// IStrategy,
// KeeperCompatible
contract StrategyRecursiveFarming is Pausable, Ownable, IStrategy {
    // interfaces
    IERC20 public token;
    IPool private aavePool;
    AggregatorV3Interface private gasPriceFeed;

    // internal
    uint256 private investmentAmount;
    StrategyStatus private status;
    uint256 private quotaPrice;

    // contants
    uint256 private constant GAS_USED_DEPOSIT = 1074040;
    uint256 private constant GAS_USED_SUPPLY = 10740;
    uint256 private constant GAS_USED_BORROW = 10740;
    uint256 private constant GAS_PRICE_MULTIPLIER = 3;
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always variable
    uint16 private constant AAVE_REF_CODE = 0;
    // timestamp save the last time a contract loop was executed
    uint256 public lastTimestamp;
    uint256 public interval = 10 minutes;

    constructor(
        address _aavePoolAddr,
        address _gasPriceFeedAddr,
        address _wavaxAddr
    ) {
        lastTimestamp = block.timestamp;
        aavePool = IPool(_aavePoolAddr);
        gasPriceFeed = AggregatorV3Interface(_gasPriceFeedAddr);
        token = IERC20(_wavaxAddr);
    }

    // define investments information
    // TODO(nb): change mapping to struct
    mapping(address => uint256) public _investments;
    // define withdrawals information
    // Withdrawal[] public withdrawalQueue;
    // EnumerablesSet.AddresssSet private _investmentsAddrs;

    // TODO(nb): Save this data in the mapping
    struct Invest {
        uint256 amount;
        uint256 timestamp;
    }

    // struct for withdrawalQueue array
    struct Withdrawal {
        address userAddress;
        uint256 amount;
    }

    // status that marks the next step to do in the strategy for keeper
    enum StrategyStatus {
        Borrow,
        Supply,
        Done
    }

    // events for Deposit and Withdraw funcitons
    event Deposit(address indexed userAddr, uint256 amount);
    event Withdraw(address indexed userAddr, uint256 amount);

    // define event for notify that more gas is needed
    // event needGas(uint256 minGasNeeded)

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 amount) external {
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
            status = StrategyStatus.Done;
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

    // method for repay the borrow with collateral
    function repayWithCollateral(uint256 amount) public {
        quotaPrice = _getCuotaPrice();
        aavePool.repayWithATokens(
            address(token),
            amount * quotaPrice,
            INTEREST_RATE_MODE
        );
    }

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 amount) external {
        // check if user has requested amount
        require(
            _investments[msg.sender] > 0 || _investments[msg.sender] >= amount,
            "No balance for requested amount"
        );

        // TODO(nb): implement correctly the quotas calc flow
        // get the quota price for calc the amount to withdraw
        quotaPrice = _getCuotaPrice();

        // repay the Aave loan with collateral
        repayWithCollateral(amount * quotaPrice);

        // rest the amount repayed of investments
        _investments[msg.sender] -= amount;

        // update the status of strategy for the next step needed
        emit Withdraw(msg.sender, amount);
    }

    // method for withdraw and transfer tokens to the users
    function _withdraw(address userAdrr, uint256 amount) public {
        aavePool.withdraw(address(token), amount * quotaPrice, userAdrr);
    }

    function _getCuotaQty(address tokenAddr, uint256 amount)
        internal
        pure
        returns (uint256)
    {
        uint256 qty = amount / _getCuotaPrice();
        return qty;
    }

    function _getCuotaPrice() internal pure returns (uint256) {
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
}
