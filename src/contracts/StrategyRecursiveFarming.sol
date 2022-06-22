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
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";

// errors
error Error__NotEnoughBalance(uint256 balance);
error Error__NotEnoughQuotas(uint256 quotas, uint256 requestedQuotas);
error Error__UpkeepNotNeeded(
    uint256 raffleState,
    uint256 timePassed,
    uint256 interval
);
error Error__RecursionNotNeeded(uint256 raffleState);
error Error__PercentageOutOfRange(uint256 amountPercentage);
error Error__UserHasZeroQuotas();

contract StrategyRecursiveFarming is
    Pausable,
    Ownable,
    IStrategy,
    KeeperCompatibleInterface
{
    using SafeMath for uint256;
    // interfaces
    IERC20 public immutable token;
    IPool public immutable aavePool;
    AggregatorV3Interface public immutable gasPriceFeed;
    IRewardsController public immutable rewardsManager;

    // internal
    uint256 private investmentAmount;
    StrategyStatus private status;
    uint256 private _lastTimestamp;
    uint256 private _interval;
    uint256 private _totalInvested;
    address[] private _tokenAddresses;
    uint256 private immutable _wavaxTotalSupply;
    uint256 private _quotas;
    uint256 private _gasPriceMultiplier; // multiplier of gas price in if conditionals
    uint16 private _aaveRefCode;
    bool private _withdrawing;

    // constants
    uint256 private constant GAS_USED_DEPOSIT = 345304;
    uint256 private constant GAS_USED_BORROW = 321838;
    uint256 private constant GAS_USED_SUPPLY = 250410;
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always in variable mode

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
        _tokenAddresses.push(_wavaxAddr); // token for claiming rewards
        _wavaxTotalSupply = token.totalSupply(); // for getQuotaPrice logic
        _gasPriceMultiplier = gasPriceMultiplier;
    }

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 _amount) external {
        // assert that msg.sender has enough gas to execute the method
        if (token.balanceOf(address(msg.sender)) < _amount) {
            revert Error__NotEnoughBalance(
                token.balanceOf(address(msg.sender))
            );
        }

        // calculate and save quotas
        _quotas = _getQuotaQty(_amount);
        _investments[msg.sender] += _quotas;
        // sum amount to _totalInvested
        _totalInvested += _amount;

        // update the status of the strategy to the next step to do
        status = StrategyStatus.Borrow;

        // transfer the user amount to this contract (user has to approve before this)
        token.transferFrom(msg.sender, address(this), _amount);

        // approve and supply liquidity to the protocol
        token.approve(address(aavePool), _amount);
        aavePool.supply(address(token), _amount, address(this), _aaveRefCode);

        // emit Deposit event
        emit Deposit(msg.sender, _amount, _quotas);
    }

    // method for borrow in Aave
    function _borrow(uint256 _borrowAvailable) internal {
        // update status to the Supply (amount borrowed), that is the next step to do
        status = StrategyStatus.Supply;

        // execute borrow in Aave
        aavePool.borrow(
            address(token),
            _borrowAvailable,
            INTEREST_RATE_MODE,
            _aaveRefCode,
            address(this)
        );
    }

    // method for supply liquidity to aave
    function _supply(uint256 _totalBalance) internal {
        // update status to borrow, that is the next step
        status = StrategyStatus.Borrow;

        // approve and supply liquidity
        token.approve(address(aavePool), _totalBalance);
        aavePool.supply(
            address(token),
            _totalBalance,
            address(this),
            _aaveRefCode
        );
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
        upkeepNeeded = intervalPassed && statusIsOk && (!_withdrawing);
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

    /** 
    @dev function to get the quota based on the percentage inserted
    @notice quotas request percentage must be between 1 and 100.
    If all is correct, it will withdraw the quota percentage requested to the sender
     */

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 _amountPercentage) external {
        // assert that percentage is not out of the range 1-100
        if (_amountPercentage <= 0 || _amountPercentage > 100) {
            revert Error__PercentageOutOfRange(_amountPercentage);
        }

        uint256 quotasToWithdraw = (_amountPercentage *
            _investments[msg.sender]) / 100;

        // check if user has requested amount
        if (quotasToWithdraw == 0) {
            revert Error__UserHasZeroQuotas();
        }

        // rest the amount repayed of investments
        uint256 amount = _getAmountFromQuotas(quotasToWithdraw);

        // updates investments
        _investments[msg.sender] -= quotasToWithdraw;

        // update for not doing supply or borrow wtih the withdraw amount, until is in the investors address back
        _withdrawing = true;

        // repay the Aave loan with collateral
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);

        // update the status of strategy for the next step needed
        emit Withdraw(address(msg.sender), amount, quotasToWithdraw);
    }

    // method for withdraw and transfer tokens to the users
    function withdraw(address _userAddr, uint256 _amount) external onlyOwner {
        // rest amount to _totalInvested
        _totalInvested -= _amount;

        // once is withdrawed, the strategy will be able to supply or borrow again
        _withdrawing = false;

        // withdraw token amount from aave, to the userAddr
        aavePool.withdraw(address(token), _amount, _userAddr);
    }

    // method for claiming rewards in aave
    function claimRewards() external onlyOwner {
        rewardsManager.claimAllRewardsToSelf(_tokenAddresses);
    }

    // method for getting the quota quantity based on the adeposited amount
    function _getQuotaQty(uint256 _amount) internal view returns (uint256) {
        return (_amount * _wavaxTotalSupply) / _getQuotaPrice();
    }

    // method for calculating the quota price (based on the profit of the strategy)
    function _getQuotaPrice() internal view returns (uint256) {
        (uint256 totalCollateralBase, uint256 totalDebtBase, , , , ) = aavePool
            .getUserAccountData(address(this));

        // calculate profit (in a tuple because of tryAdd/trySub returns)
        (, uint256 profit) = totalCollateralBase.trySub(totalDebtBase);

        // 1 + profit is for avoid quotaPrice to be 0
        return 1 + profit;
    }

    // method that returns token amount based on the quotas amount
    function _getAmountFromQuotas(uint256 _quotaAmount)
        internal
        view
        returns (uint256)
    {
        if (_quotaAmount == 0) {
            return 0;
        }
        return (_wavaxTotalSupply / _quotaAmount) * _getQuotaPrice();
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
        if (_interval == interval) {
            return;
        }
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

    function getAmountFromQuotas(uint256 _quotaAmount)
        external
        view
        onlyOwner
        returns (uint256)
    {
        return _getAmountFromQuotas(_quotaAmount);
    }

    function getAaveRefCode() external view returns (uint256) {
        return _aaveRefCode;
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
        return _totalInvested;
    }

    // this method returns the status of the strategy
    function getStatus() external view onlyOwner returns (StrategyStatus) {
        return status;
    }

    function getWithdrawStatus() external view onlyOwner returns (bool) {
        return _withdrawing;
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

    function getTotalSupply() external view returns (uint256) {
        return _wavaxTotalSupply;
    }

    function getTokenAddresses() external view returns (address[] memory) {
        return _tokenAddresses;
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
