// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
import {IStrategy} from "./IStrategy.sol";
import "hardhat/console.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
import {IWETH} from "@aave/core-v3/contracts/misc/interfaces/IWETH.sol";

import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

contract StrategyRecursiveFarming is
    IStrategy,
    Pausable,
    KeeperCompatibleInterface,
    Ownable
{
    using EnumerableSet for EnumerableSet.AddressSet;

    // interfaces
    IERC20 public token;
    IPool private aavePool;
    AggregatorV3Interface private gasPriceFeed;

    // external
    DataTypes.ReserveConfigurationMap private tokenInfo;
    uint256 private ltv;

    // internal
    uint256 private investmentAmount;
    bool private continues;
    StrategyStatus status;

    // contants
    uint256 private constant GAS_USED_DEPOSIT = 1074040;
    uint256 private constant GAS_USED_SUPPLY = 10740;
    uint256 private constant GAS_USED_BORROW = 10740;
    uint256 private constant INTEREST_RATE_MODE = 2;

    // timestamp save the last time a contract loop was executed
    uint256 public lastTimestamp;

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

    enum StrategyStatus {
        Borrow,
        Supply,
        Done
    }

    enum InvestStatus {
        Pristine,
        Active
    }

    struct Invest {
        // q.price[i] = 1100
        uint256 total; // 1.000.000 => 600.000  (diff => quotas => 400k)
        uint256 neto; // 1.000.000 (~999.990)
        uint256 gas; //
        uint256 quotas; // 200 (1ra iteración qp=1000), 202 (2da iteración qp=990), 202 (3da iteración qp=990), 200 (2da iteración qp=1000) , 181 (5ta iteración qp=1100) = 985 quotas
    }

    // define investments information
    mapping(address => Invest) public _investments;
    EnumerableSet.AddressSet private _investmentsAddrs;

    // define contracts events
    event Deposit(address userAddr, uint256 amount, uint256 quotas);
    event Borrow(address userAddr, uint256 amount);
    event Supply(address userAddr, uint256 amount, bool continues);
    event Withdraw(address userAddr, uint256 quotas);

    // method for calculating supply amount, by substracting the gas amount estimation
    function calculateSupplyAmount(uint256 totalAmount)
        internal
        view
        returns (uint256)
    {
        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

        return
            (totalAmount +
                GAS_USED_BORROW +
                GAS_USED_DEPOSIT +
                GAS_USED_DEPOSIT) * (uint256(gasPrice) * 3);
    }

    // method for unwrap the ERC20 into the native token, in order to pay gas with that
    function _unwrapERC20Token(uint256 amount) internal {
        IWETH(address(token)).withdraw(amount);
    }

    // method for getting the Loan To Value (LTV) of the asset
    function getLTV() internal returns (uint256) {
        tokenInfo = aavePool.getConfiguration(address(token));
        //tokenInfo = 5708990770823839524233143896245666479610309254976
        // uint16 ltv = uint16(tokenInfo & FFFF) << 16;

        // TODO(nb): Parse ltv from tokenInfo or change implementation
        ltv = 200000; // tokenInfo[:15]

        return ltv;
    }

    function setLTV(uint256 _ltv) external {
        ltv = _ltv;
    }

    function _getCuotaQty(uint256 amount) internal view returns (uint256) {
        uint256 qty = amount / _getCuotaPrice();
        return qty;
    }

    function _getCuotaPrice() internal pure returns (uint256) {
        return 0;
    }

    // method defined for the user can make an investment, whether it is a first time or not
    function deposit(address userAddr, uint256 amount) external payable {
        require(
            amount <= token.balanceOf(address(this)),
            "balance is not enough"
        );

        // get current investment by user address
        Invest storage i = _investments[msg.sender];

        // use case when the user invests for the first time
        if (i.status == InvestStatus.Pristine) {
            i.total = amount;
            i.neto = 0;
            i.status = InvestStatus.Active;
            i.quotas = _getCuotaQty(amount);

            _investmentsAddrs.add(msg.sender);
        }

        // check if we have enough amount for paying gas
        investmentAmount = calculateSupplyAmount(amount);

        // if we don't, we'll unwrap the necessary gas amount of the ERC20 token
        if (amount - investmentAmount < address(this).balance) {
            _unwrapERC20Token(
                amount - investmentAmount - address(this).balance
            );
        }

        // approve and supply liquidity to the protocol
        token.approve(address(aavePool), investmentAmount);
        aavePool.supply(address(token), investmentAmount, address(this), 0);

        // get the LTV value for the function borrow() to work correctly
        ltv = getLTV();

        status = StrategyStatus.Borrow;

        emit Deposit(userAddr, investmentAmount, i.quotas);
    }

    function borrow(address userAddr, uint256 amount) public {
        aavePool.borrow(
            address(token),
            amount * ltv,
            INTEREST_RATE_MODE,
            0,
            address(this)
        );

        status = StrategyStatus.Supply;
        emit Borrow(userAddr, amount * ltv);
    }

    function supply(address userAddr, uint256 amount) public {
        continues = true;

        (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();
        console.logInt(gasPrice);
        console.logUint(gasleft());
        console.logUint(gasleft() * uint256(gasPrice));

        if (
            amount <=
            (GAS_USED_SUPPLY * 2 + GAS_USED_BORROW) * uint256(gasPrice) * 2
        ) {
            continues = false;
            status = StrategyStatus.Done;
            _investments[userAddr].neto = _investments[userAddr].total - amount;
        } else {
            status = StrategyStatus.Supply;
        }

        token.approve(address(aavePool), amount);
        aavePool.supply(address(token), amount, address(this), 0);

        emit Supply(userAddr, amount, continues);
    }

    // method for repay the borrow with collateral
    function repayWithCollateral(uint256 amount) public {
        aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);
    }

    // method defined for the user can withdraw from the strategy
    function withdraw(
        address userAddr, // @nb: Can we avoid this param using msg.sender??
        uint256 quotas
    ) external payable {
        // get current investment by user address
        Invest storage i = _investments[userAddr];

        // check if user investment is active
        require(i.status == InvestStatus.Active, "invest is not active");

        // check if user investment has enough balance in quotas
        require(quotas <= i.quotas, "no balance for requested quotas");

        // strategy implementation...

        // TODO(ca): check overflow use case when quota is > i.quotas
        i.quotas = i.quotas - quotas;

        // TODO(ca): transfer amount (quota*price) to user address

        emit Withdraw(userAddr, quotas);
    }

    function transferUser(address userAddr, uint256 quotas) external {
        // TODO: make quotas * amount calculation
        token.transfer(userAddr, quotas);
    }

    // @nb: remove parameter tokenAddr from IStraetgy? Is not necessary here.
    function getQuotaQty(address tokenAddr, uint256 amount)
        external
        view
        returns (uint256)
    {
        return _getCuotaQty(amount);
    }

    function getQuotaPrice() external pure override returns (uint256) {
        return _getCuotaPrice();
    }

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
        upkeepNeeded = continues;
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        if ((continues)) {
            lastTimestamp = block.timestamp;
        }

        if (status == StrategyStatus.Borrow) {
            // borrow(userAddr, amount);
            return;
        }

        if (status == StrategyStatus.Supply) {
            // supply((userAddr), amount);
            return;
        }
    }
}
