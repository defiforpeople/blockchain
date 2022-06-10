// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnumerableMap} from "@openzeppelin/contracts/utils/structs/EnumerableMap.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IStrategy} from "./IStrategy.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IRewardsController} from "@aave/periphery-v3/contracts/rewards/interfaces/IRewardsController.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {KeeperCompatibleInterface} from "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import {LinkTokenInterface} from "@chainlink/contracts/src/v0.8/interfaces/LinkTokenInterface.sol";

// errors
error Error__NotEnoughGas();
error Error__NotEnoughBalance();
error Error__NotEnoughQuotas();
error Error__UpkeepNotNeeded(uint256 raffleState);
error Error__StrategyIsDone();

contract StrategyRecursiveFarming is
    Pausable,
    Ownable,
    IStrategy,
    KeeperCompatibleInterface
{
    // interfaces
    IERC20 private immutable token;
    IPool private immutable aavePool;
    AggregatorV3Interface private immutable gasPriceFeed;
    IRewardsController private immutable rewardsManager;

    // internal
    uint256 private investmentAmount;
    StrategyStatus private status;
    uint256 private lastTimestamp;
    uint256 private interval;
    uint256 public totalInvested;
    address[] public tokenAddresses;
    uint256 private immutable wavaxTotalSupply;

    // constants
    uint256 private constant GAS_USED_DEPOSIT = 345304;
    uint256 private constant GAS_USED_BORROW = 321838;
    uint256 private constant GAS_USED_SUPPLY = 250410;
    uint256 private constant GAS_USED_WITHDRAW = 223654;
    uint256 private constant GAS_USED_REQ_WITHDRAW = 223654;
    uint256 private constant GAS_USED_CLAIM = 223654;
    uint256 private constant GAS_PRICE_MULTIPLIER = 0; // multiply for 0 for using less amount in a testnet version ;)
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always in variable mode
    uint16 private constant AAVE_REF_CODE = 0;
    uint256 private constant BASE_QUOTA = 1;

    struct Invest {
        uint256 amount;
        uint256 quotas;
    }

    // define investments information
    mapping(address => Invest) public _investments;

    // status that marks the next step to do in the strategy
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
        rewardsManager = IRewardsController(_aaveRewardsManager); // for claiming rewards
        interval = _interval; // for keeper logic
        lastTimestamp = block.timestamp; // for keeper logic
        tokenAddresses.push(_wavaxAddr); // token for claiming rewards
        wavaxTotalSupply = token.totalSupply(); // for getQuotaPrice logic
    }

    // modifier for calculating if the msg.sender has enough gas based on the gas needed per function
    modifier enoughGas(uint256 gasNeeded) {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();
        if (address(msg.sender).balance < gasNeeded * uint256(gasPrice)) {
            revert Error__NotEnoughGas();
        }
        _;
    }

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 _amount) external enoughGas(GAS_USED_DEPOSIT) {
        // assert that msg.sender has enough gas to execute the method
        if (token.balanceOf(address(msg.sender)) < _amount) {
            revert Error__NotEnoughBalance();
        }
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

    function _borrow() internal enoughGas(GAS_USED_BORROW) {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

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
    function _supply() internal enoughGas(GAS_USED_SUPPLY) {
        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

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
        if (status != StrategyStatus.Done) {
            revert Error__StrategyIsDone();
        }

        if (status == StrategyStatus.Borrow) {
            _borrow();
        } else if (status == StrategyStatus.Supply) {
            _supply();
        }
    }

    function quotasPerAddress() external view returns (uint256) {
        return _investments[msg.sender].quotas;
    }

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 _quotas)
        external
        enoughGas(GAS_USED_REQ_WITHDRAW)
    {
        // check if user has requested amount
        if (
            _investments[msg.sender].quotas > 0 &&
            _investments[msg.sender].quotas >= _quotas
        ) {
            revert Error__NotEnoughQuotas();
        }
        // rest the amount repayed of investments
        uint256 amount = _quotas * _getQuotaPrice();
        // uint256 quotas = _amount * _getQuotaPrice();
        _investments[msg.sender].amount -= amount;
        _investments[msg.sender].quotas -= _quotas;

        // repay the Aave loan with collateral
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);

        // update the status of strategy for the next step needed
        emit Withdraw(msg.sender, amount, _quotas);
    }

    // method for withdraw and transfer tokens to the users
    function withdraw(address _userAddr, uint256 _amount)
        external
        onlyOwner
        enoughGas(GAS_USED_WITHDRAW)
    {
        // withdraw token amount from aave, to the userAddr
        aavePool.withdraw(address(token), _amount, _userAddr);

        // rest amount to totalInvested
        totalInvested -= _amount;
    }

    // method for claiming rewards in aave
    function claimRewards() external onlyOwner enoughGas(GAS_USED_CLAIM) {
        rewardsManager.claimAllRewardsToSelf(tokenAddresses);
    }

    // method for getting the APY from AAVE
    function getAPY() external view onlyOwner returns (uint256) {
        return aavePool.getReserveNormalizedIncome(address(this));
    }

    // method for calculating the quota quantity based on the deposited aomunt
    function getQuotaQty(uint256 _amount)
        external
        view
        onlyOwner
        returns (uint256)
    {
        return _getQuotaQty(_amount);
    }

    // method for getting the quota price
    function getQuotaPrice() external view onlyOwner returns (uint256) {
        return _getQuotaPrice();
    }

    // method for getting the quota quantity based on the adeposited amount
    function _getQuotaQty(uint256 _amount) internal view returns (uint256) {
        uint256 quotasQuantity = _amount / _getQuotaPrice();
        return quotasQuantity;
    }

    // method for calculating the quota price (based on the profit of the strategy)
    function _getQuotaPrice() internal view returns (uint256) {
        (uint256 totalCollateralBase, uint256 totalDebtBase, , , , ) = aavePool
            .getUserAccountData(address(this));

        // calculate profit
        uint256 profit = totalCollateralBase +
            token.balanceOf(address(this)) -
            totalDebtBase -
            totalInvested;

        // normalized profit + BASE_QUOTA is for avoid quotaPrice to be 0
        uint256 quotaPrice = BASE_QUOTA + ((profit * 100) / wavaxTotalSupply);
        return quotaPrice;
    }

    // method that uses keeper for know if it has to executo performUpkeep() or not
    function checkUpkeep(
        bytes memory /* checkData */
    )
        public
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
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Error__UpkeepNotNeeded(uint256(status));
        }
        require(status != StrategyStatus.Done, "The strategy is completed");

        if (status == StrategyStatus.Borrow) {
            _borrow();
        } else if (status == StrategyStatus.Supply) {
            _supply();
        }
        // update the last time that the keeper executed the function
        lastTimestamp = block.timestamp;
    }

    // method for updating keeper interval
    function updateInterval(uint256 _interval) external onlyOwner {
        interval = _interval;
    }

    /* Other view functions */

    function viewLastTimestamp() external view onlyOwner returns (uint256) {
        return lastTimestamp;
    }

    function viewInterval() external view onlyOwner returns (uint256) {
        return interval;
    }
}
