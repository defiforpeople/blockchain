// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
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
contract StrategyRecursiveFarming is Pausable, Ownable, KeeperCompatible {
    // interfaces
    IERC20 public token;
    IPool private aavePool;
    AggregatorV3Interface private gasPriceFeed;

    // internal
    uint256 private investmentAmount;
    StrategyStatus private status;
    uint256 private _withdrawableAmount;

    // contants
    uint256 private constant GAS_USED_DEPOSIT = 1074040;
    uint256 private constant GAS_USED_SUPPLY = 10740;
    uint256 private constant GAS_USED_BORROW = 10740;
    uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always variable
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

    // method for calculating supply amount, by substracting the gas amount estimation
    function calculateSupplyAmount(uint256 totalAmount)
        internal
        view
        returns (uint256)
    {
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();
        return
            totalAmount -
            ((GAS_USED_BORROW + GAS_USED_SUPPLY + GAS_USED_DEPOSIT) *
                (uint256(gasPrice) * 3));
    }

    // method defined for the user to make an supply, and we save the investment amount with his address
    function deposit(uint256 amount) external {
        // transfer the user amount to this contract (user has to approve before this)
        token.transferFrom(msg.sender, address(this), amount);

        // check if we have enough amount for paying gas
        investmentAmount = calculateSupplyAmount(amount);

        // save investments in the mapping
        _investments[msg.sender] += amount;

        // approve and supply liquidity to the protocol
        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), 0);

        status = StrategyStatus.Borrow;

        emit Deposit(msg.sender, amount);
    }

    function borrow() public {
        // get the max available amount ofr borrowing
        (, , uint256 borrowAvailable, , , ) = aavePool.getUserAccountData(
            address(this)
        );

        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        if (
            borrowAvailable <
            (GAS_USED_DEPOSIT + GAS_USED_SUPPLY) * uint256(gasPrice) * 3
        ) {
            status = StrategyStatus.Done;
            return;
        }

        // method for borrow in Aave
        aavePool.borrow(
            address(token),
            borrowAvailable,
            INTEREST_RATE_MODE,
            0,
            address(this)
        );

        // the next step is supplying the amount borrowed
        status = StrategyStatus.Supply;
    }

    function supply() public {
        // TODO(nb): add constants for gas multiplier
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        // check if we have enough amount for supplying
        if (
            token.balanceOf(address(this)) <
            GAS_USED_DEPOSIT * uint256(gasPrice) * 3
        ) {
            status = StrategyStatus.Done;
            return;
        }

        uint256 amount = token.balanceOf(address(this));
        // approve and supply liquidity
        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), 0);

        // update status to done, because the loop has finished
        status = StrategyStatus.Done;
        // emit CallKeeper();
    }

    function viewStatus() external view returns (StrategyStatus) {
        return status;
    }

    function doRecursion() external {
        if (status == StrategyStatus.Borrow) {
            borrow();
        } else if (status == StrategyStatus.Supply) {
            supply();
        }
    }

    // method for repay the borrow with collateral
    function repayWithCollateral(uint256 amount) public {
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);
    }

    // method defined for the user can withdraw from the strategy
    function requestWithdraw(uint256 amount) external {
        // check if user has requested amount
        require(
            _investments[msg.sender] > 0 || _investments[msg.sender] >= amount,
            "No balance for requested amount"
        );

        // repay the Aave loan with collateral
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);

        // rest the amount repayed of investments
        _investments[msg.sender] -= amount;

        // update the status of strategy for the next step needed
        emit Withdraw(msg.sender, amount);
    }

    // method for withdraw and transfer tokens to the users
    function _withdraw(address userAdrr, uint256 amount) public {
        aavePool.withdraw(address(token), amount, userAdrr);
    }

    function checkUpkeep(
        bytes calldata /* checkData */
    )
        external
        view
        override
        returns (bool upkeepNeeded, bytes memory performData)
    {
        upkeepNeeded =
            (status != StrategyStatus.Done) ||
            (block.timestamp - lastTimestamp) > interval;
    }

    function performUpkeep(bytes calldata performData) external override {
        require((status == StrategyStatus.Done), "strategy is done");
        require(
            ((block.timestamp - lastTimestamp) <= interval),
            "interval is not over yet"
        );

        lastTimestamp = block.timestamp;

        //TODO(nb): use arrays for supply and withdraw operations

        if (status == StrategyStatus.Borrow) {
            borrow();
        } else if (status == StrategyStatus.Supply) {
            supply();
        }

        // if (withdrawalQueue.length > 0) {
        //     _withdraw();
        //     return;
        // }
        // TODO(nb): question: if the keeper has to execute a supply/borrow function AND a withdraw, it will be 2 or more executions. How can be implemented that tx.wait() in the keeper script?
    }
}
