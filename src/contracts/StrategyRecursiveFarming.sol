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
import {IRewardsController} from "@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {KeeperCompatibleInterface} from "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import {LinkTokenInterface} from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

contract StrategyRecursiveFarming is
    Pausable,
    Ownable,
    IStrategy,
    KeeperCompatibleInterface
{
    // interfaces
    IERC20 public token;
    IPool private aavePool;
    AggregatorV3Interface private gasPriceFeed;
    IRewardsController public rewardsManager;

    // internal
    uint256 private investmentAmount;
    StrategyStatus private status;
    uint256 private lastTimestamp;
    uint256 public interval;
    uint256 public totalInvested;
    address[] public tokenAddresses;

    // constants
    // TODO(nb): update all the GAS constants when we have the last version of the contract
    uint256 private constant GAS_USED_DEPOSIT = 195770;
    uint256 private constant GAS_USED_BORROW = 313819;
    uint256 private constant GAS_USED_SUPPLY = 249953;
    uint256 private constant GAS_USED_WITHDRAW = 223654;
    uint256 private constant GAS_USED_REQ_WITHDRAW = 223654;
    uint256 private constant GAS_PRICE_MULTIPLIER = 0;
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always in variable mode
    uint16 private constant AAVE_REF_CODE = 0;
    uint256 private constant BASE_QUOTA = 1**10**18;

    struct Invest {
        uint256 amount;
        uint256 quotas;
    }

    // define investments information
    mapping(address => Invest) public _investments;

    // status that marks the next step to do in the strategy for keeper
    enum StrategyStatus {
        Borrow,
        Supply,
        Done
    }

    // events for Deposit and Withdraw funcitons
    event Deposit(address indexed userAddr, uint256 amount, uint256 quotas);
    event Withdraw(address indexed userAddr, uint256 amount, uint256 quotas);

    constructor(
        address _aavePoolAddr,
        address _gasPriceFeedAddr,
        address _wavaxAddr,
        address _aaveRewardsManager,
        uint256 _interval
    ) {
        aavePool = IPool(_aavePoolAddr);
        gasPriceFeed = AggregatorV3Interface(_gasPriceFeedAddr);
        token = IERC20(_wavaxAddr);
        rewardsManager = IRewardsController(_aaveRewardsManager);
        interval = _interval;
        lastTimestamp = block.timestamp;
        tokenAddresses.push(_wavaxAddr);
    }

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 _amount) external {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // assert that msg.sender has enough gas to execute the method
        require(
            address(msg.sender).balance >= GAS_USED_DEPOSIT * uint256(gasPrice),
            "sender has not enough gas"
        );

        // transfer the user amount to this contract (user has to approve before this)
        token.transferFrom(msg.sender, address(this), _amount);

        // save amount in the mapping
        _investments[msg.sender].amount += _amount;
        // calculate and save quotas
        uint256 quotas = _getQuotaQty(_amount);
        _investments[msg.sender].quotas += quotas;
        // sum amount to totalInvested
        totalInvested += _amount;

        // approve and supply liquidity to the protocol
        token.approve(address(aavePool), _amount);
        aavePool.supply(address(token), _amount, address(this), AAVE_REF_CODE);

        // update the status of the strategy to the next step to do
        status = StrategyStatus.Borrow;

        // emit Deposit event
        emit Deposit(msg.sender, _amount, quotas);
    }

    function borrow() internal {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // assert that msg.sender has enough gas to execute the method
        require(
            address(msg.sender).balance >= GAS_USED_BORROW * uint256(gasPrice),
            "sender has not enough gas"
        );

        // get the max available amount ofr borrowing
        (, , uint256 borrowAvailable, , , ) = aavePool.getUserAccountData(
            address(this)
        );

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

    // method for supply liquidity to aave
    function supply() internal {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // assert that msg.sender has enough gas to execute the method
        require(
            address(msg.sender).balance >= GAS_USED_SUPPLY * uint256(gasPrice),
            "sender has not enough gas"
        );

        // if the amount is not enough for continuing with the execution, the status will be Done and the exec'll be finished
        if (
            token.balanceOf(address(this)) <
            GAS_USED_DEPOSIT * uint256(gasPrice) * GAS_PRICE_MULTIPLIER
        ) {
            status = StrategyStatus.Done;
            return;
        } // otherwise, it will continue with the execution flow:

        // the var amount will contain the WAVAX of the contract(what we borrowed before)
        uint256 amount = token.balanceOf(address(this));

        // approve and supply liquidity
        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), AAVE_REF_CODE);

        // get the max available amount ofr borrowing
        (, , uint256 borrowAvailable, , , ) = aavePool.getUserAccountData(
            address(this)
        );

        // if the amount is not enough for continuing with the execution, the status will be Done and the exec will be finished
        if (
            borrowAvailable <
            (GAS_USED_DEPOSIT + GAS_USED_SUPPLY) *
                uint256(gasPrice) *
                GAS_PRICE_MULTIPLIER
        ) {
            // update status to done, because the loop has finished
            status = StrategyStatus.Done;
            return;
        }

        // otherwise, update status to borrow, that is the next step
        status = StrategyStatus.Borrow;
    }

    // this method returns the status of the strategy
    function viewStatus() external view onlyOwner returns (StrategyStatus) {
        return status;
    }

    // method for executing the loop, based on the status of the contract
    function doRecursion() external onlyOwner {
        require(status != StrategyStatus.Done, "The strategy is completed");
        if (status == StrategyStatus.Borrow) {
            borrow();
        } else if (status == StrategyStatus.Supply) {
            supply();
        }
    }

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 _quotas) external {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // assert that msg.sender has enough gas to execute the method
        require(
            address(msg.sender).balance >=
                GAS_USED_REQ_WITHDRAW * uint256(gasPrice),
            "sender has not enough gas"
        );

        // check if user has requested amount
        require(
            _investments[msg.sender].quotas > 0 &&
                _investments[msg.sender].quotas >= _quotas,
            "No balance for requested amount"
        );

        // rest the amount repayed of investments
        uint256 amount = _quotas * _getQuotaPrice();
        _investments[msg.sender].amount -= amount;
        _investments[msg.sender].quotas -= _quotas;

        // repay the Aave loan with collateral
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);

        // update the status of strategy for the next step needed
        emit Withdraw(msg.sender, amount, _quotas);
    }

    // method for withdraw and transfer tokens to the users
    function withdraw(address _userAddr, uint256 _amount) external onlyOwner {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // assert that msg.sender has enough gas to execute the method
        require(
            address(msg.sender).balance > GAS_USED_WITHDRAW * uint256(gasPrice),
            "sender has not enough gas"
        );

        // withdraw token amount from aave, to the userAddr
        aavePool.withdraw(address(token), _amount, _userAddr);

        // rest amount to totalInvested
        totalInvested -= _amount;
    }

    // method for claiming rewards in aave
    function claimRewards() external onlyOwner {
        rewardsManager.claimAllRewardsToSelf(tokenAddresses);
    }

    //
    function getQuotaQty(uint256 _amount)
        external
        view
        onlyOwner
        returns (uint256)
    {
        return _getQuotaQty(_amount);
    }

    function getQuotaPrice() external view onlyOwner returns (uint256) {
        return _getQuotaPrice();
    }

    function _getQuotaQty(uint256 _amount) internal view returns (uint256) {
        uint256 quotasQuantity = _amount / _getQuotaPrice();
        return quotasQuantity;
    }

    function _getQuotaPrice() internal view returns (uint256) {
        (uint256 totalCollateralBase, uint256 totalDebtBase, , , , ) = aavePool
            .getUserAccountData(address(this));

        uint256 profit = totalCollateralBase +
            token.balanceOf(address(this)) -
            totalDebtBase -
            totalInvested;

        uint256 quotaPrice = BASE_QUOTA + profit;
        return quotaPrice;
    }

    // method for returning if the wallet that'll execute has enough GAS in order to complete a loop
    function gasNeeded() external view onlyOwner returns (uint256) {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        if (
            address(msg.sender).balance <
            (GAS_USED_BORROW + GAS_USED_DEPOSIT) *
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

    // method that uses keeper for know if it has to executo performUpkeep() or not
    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (
            bool upkeepNeeded,
            bytes memory /* performData */
        )
    {
        upkeepNeeded =
            (block.timestamp - lastTimestamp) > interval &&
            status != StrategyStatus.Done;
    }

    // method for executing the recursive loop based on the status of the strategy with the keeper
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        require(status != StrategyStatus.Done, "The strategy is completed");

        if (status == StrategyStatus.Borrow) {
            borrow();
        } else if (status == StrategyStatus.Supply) {
            supply();
        }
        // update the last time that the keeper executed the function
        lastTimestamp = block.timestamp;
    }

    // method for updating keeper interval
    function updateInterval(uint256 _interval) external onlyOwner {
        interval = _interval;
    }
}
