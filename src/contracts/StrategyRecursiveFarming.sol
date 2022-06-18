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
import "hardhat/console.sol";

// errors
error Error__NotEnoughBalance();
error Error__NotEnoughQuotas();
error Error__UpkeepNotNeeded(
    uint256 raffleState,
    uint256 timePassed,
    uint256 interval
);
error Error__RecursionNotNeeded(uint256 raffleState);
error Error__AmountIsZero(uint256 amount);

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
    uint256 private _lastTimestamp;
    uint256 private _interval;
    uint256 public totalInvested;
    address[] public tokenAddresses;
    uint256 private immutable _wavaxTotalSupply;
    uint256 private _quotas;
    uint256 private _gasPriceMultiplier; // multiplier of gas price in if conditionals
    uint16 private _aaveRefCode;

    // constants
    uint256 private constant GAS_USED_DEPOSIT = 345304;
    uint256 private constant GAS_USED_BORROW = 321838;
    uint256 private constant GAS_USED_SUPPLY = 250410;
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always in variable mode
    uint256 private constant BASE_QUOTA = 1;

    // define investments information
    mapping(address => uint256) private _investments;

    // status that marks the next step to do in the strategy
    enum StrategyStatus {
        Pristine,
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
        uint256 interval,
        uint256 gasPriceMultiplier
    ) {
        aavePool = IPool(_aavePoolAddr);
        gasPriceFeed = AggregatorV3Interface(_gasPriceFeedAddr);
        token = IERC20(_wavaxAddr);
        rewardsManager = IRewardsController(_aaveRewardsManager); // for claiming rewards
        status = StrategyStatus.Pristine;
        _interval = interval; // for keeper logic
        _lastTimestamp = block.timestamp; // for keeper logic
        tokenAddresses.push(_wavaxAddr); // token for claiming rewards
        _wavaxTotalSupply = token.totalSupply(); // for getQuotaPrice logic
        _gasPriceMultiplier = gasPriceMultiplier;
    }

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 _amount) external {
        // assert that msg.sender has enough gas to execute the method
        if (token.balanceOf(address(msg.sender)) < _amount) {
            revert Error__NotEnoughBalance();
        }

        // transfer the user amount to this contract (user has to approve before this)
        token.transferFrom(msg.sender, address(this), _amount);

        // calculate and save quotas
        _quotas = _getQuotaQty(_amount);
        _investments[msg.sender] += _quotas;
        // sum amount to totalInvested
        totalInvested += _amount;

        // approve and supply liquidity to the protocol
        token.approve(address(aavePool), _amount);
        aavePool.supply(address(token), _amount, address(this), _aaveRefCode);

        // update the status of the strategy to the next step to do
        status = StrategyStatus.Borrow;

        // emit Deposit event
        emit Deposit(msg.sender, _amount, _quotas);
    }

    // Modifier for asserting that amount is greater than 0
    modifier checkAmount(uint256 _amount) {
        if (_amount == 0) {
            revert Error__AmountIsZero(_amount);
        }
        _;
    }

    function _borrow(uint256 _borrowAvailable)
        internal
        checkAmount(_borrowAvailable)
    {
        // method for borrow in Aave
        aavePool.borrow(
            address(token),
            _borrowAvailable,
            INTEREST_RATE_MODE,
            _aaveRefCode,
            address(this)
        );

        // update status to the Supply (amount borrowed), that is the next step to do
        status = StrategyStatus.Supply;
    }

    // method for supply liquidity to aave
    function _supply(uint256 _totalBalance)
        internal
        checkAmount(_totalBalance)
    {
        // approve and supply liquidity
        token.approve(address(aavePool), _totalBalance);
        aavePool.supply(
            address(token),
            _totalBalance,
            address(this),
            _aaveRefCode
        );

        // update status to borrow, that is the next step
        status = StrategyStatus.Borrow;
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
        bool intervalPassed = (block.timestamp - _lastTimestamp) > _interval;
        bool statusIsOk = status == StrategyStatus.Borrow ||
            status == StrategyStatus.Supply;
        upkeepNeeded = intervalPassed && statusIsOk;
    }

    // method for executing the recursive loop based on the status of the strategy with the keeper
    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        (bool upkeepNeeded, ) = checkUpkeep("");
        if (!upkeepNeeded) {
            revert Error__UpkeepNotNeeded(
                uint256(status),
                block.timestamp - _lastTimestamp,
                _interval
            );
        }

        // get the gas price
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        if (status == StrategyStatus.Borrow) {
            // get the max available amount for borrowing
            (, , uint256 borrowAvailable, , , ) = aavePool.getUserAccountData(
                address(this)
            );

            // if the amount is not enough for continuing with the execution, the status will be Done and the exec will be finished
            if (
                borrowAvailable <=
                (GAS_USED_BORROW + GAS_USED_SUPPLY) *
                    uint256(gasPrice) *
                    _gasPriceMultiplier
            ) {
                // update status to done, because the loop has finished
                status = StrategyStatus.Done;
                _lastTimestamp = block.timestamp;
                return;
            }

            // otherwise, it will execute _borrow() function
            _borrow(borrowAvailable);
        } else if (status == StrategyStatus.Supply) {
            // if the amount is not enough for continuing with the execution, the status will be Done and the exec'll be finished
            console.log("gas");
            console.logUint(uint256(gasPrice));
            if (
                token.balanceOf(address(this)) <
                GAS_USED_SUPPLY * uint256(gasPrice) * _gasPriceMultiplier
            ) {
                status = StrategyStatus.Done;
                _lastTimestamp = block.timestamp;
                return;
            }

            // otherwise, it will execute _supply() function
            uint256 totalBalance = token.balanceOf(address(this));
            _supply(totalBalance);
        }
        // update the last time that the keeper executed the function
        _lastTimestamp = block.timestamp;
    }

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 quotas) external {
        // check if user has requested amount
        if (
            _investments[msg.sender] > 0 && _investments[msg.sender] >= quotas
        ) {
            revert Error__NotEnoughQuotas();
        }
        // rest the amount repayed of investments
        uint256 amount = quotas * _getQuotaPrice();
        // uint256 _quotas = _amount * _getQuotaPrice();
        _investments[msg.sender] -= quotas;

        // repay the Aave loan with collateral
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);

        // update the status of strategy for the next step needed
        emit Withdraw(msg.sender, amount, quotas);
    }

    // method for withdraw and transfer tokens to the users
    function withdraw(address _userAddr, uint256 _amount) external onlyOwner {
        // withdraw token amount from aave, to the userAddr
        aavePool.withdraw(address(token), _amount, _userAddr);

        // rest amount to totalInvested
        totalInvested -= _amount;
    }

    // method for claiming rewards in aave
    function claimRewards() external onlyOwner {
        rewardsManager.claimAllRewardsToSelf(tokenAddresses);
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

        console.log("totalCollateralBase: ", totalCollateralBase);
        console.log("totalDebtBase: ", totalDebtBase);
        // calculate profit
        uint256 profit = totalCollateralBase +
            token.balanceOf(address(this)) -
            totalDebtBase -
            totalInvested;

        // normalized profit + BASE_QUOTA is for avoid quotaPrice to be 0
        uint256 quotaPrice = BASE_QUOTA + ((profit * 100) / _wavaxTotalSupply);
        return quotaPrice;
    }

    // method for update the _gasPriceMultiplier externally
    function setGasPriceMultiplier(uint256 gasPriceMultiplier)
        external
        onlyOwner
    {
        if (_gasPriceMultiplier == gasPriceMultiplier) {
            return;
        }
        _gasPriceMultiplier = gasPriceMultiplier;
    }

    // method for update aave Referral code if necessary :)
    function setAaveRefCode(uint16 aaveRefCode) external onlyOwner {
        if (_aaveRefCode == aaveRefCode) {
            return;
        }
        _aaveRefCode = aaveRefCode;
    }

    // method for updating keeper _interval
    function updateInterval(uint256 interval) external onlyOwner {
        _interval = interval;
    }

    /* View functions */

    // method for calculating the quota quantity based on the deposited aomunt
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

    // method for getting the APY from AAVE
    function getAPY() external view onlyOwner returns (uint256) {
        return aavePool.getReserveNormalizedIncome(address(this));
    }

    // amount of _quotas per address
    function getQuotasPerAddress(address _investor)
        external
        view
        returns (uint256)
    {
        return _investments[_investor];
    }

    function getTotalInvested() external view returns (uint256) {
        return totalInvested;
    }

    // this method returns the status of the strategy
    function getStatus() external view onlyOwner returns (StrategyStatus) {
        return status;
    }

    // method for get the _gasPriceMultiplier externally
    function getGasPriceMultiplier() external view returns (uint256) {
        return _gasPriceMultiplier;
    }

    function getLastTimestamp() external view onlyOwner returns (uint256) {
        return _lastTimestamp;
    }

    function getInterval() external view onlyOwner returns (uint256) {
        return _interval;
    }

    function getMaxSupply() external view returns (uint256) {
        return _wavaxTotalSupply;
    }

    // method for getting gas info (for testing purpose)
    function getGasInfo()
        external
        view
        returns (
            uint256,
            uint256,
            uint256,
            uint256
        )
    {
        return (
            GAS_USED_DEPOSIT,
            GAS_USED_SUPPLY,
            GAS_USED_BORROW,
            _gasPriceMultiplier
        );
    }
}
