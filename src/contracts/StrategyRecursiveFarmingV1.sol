// // SPDX-License-Identifier: MIT
// pragma solidity ^0.8.10;

// import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
// import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
// import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
// import {EnumerableSet} from "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
// import {Pausable} from "@openzeppelin/contracts/security/Pausable.sol";
// import {IStrategy} from "./IStrategy.sol";
// import "hardhat/console.sol";
// import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
// import {DataTypes} from "@aave/core-v3/contracts/protocol/libraries/types/DataTypes.sol";
// import {IWETH} from "@aave/core-v3/contracts/misc/interfaces/IWETH.sol";

// import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";

// contract StrategyRecursiveFarming is
//     IStrategy,
//     Pausable,
//     KeeperCompatibleInterface,
//     Ownable
// {
//     using EnumerableSet for EnumerableSet.AddressSet;

//     // interfaces
//     IERC20 public token;
//     IPool private aavePool;
//     AggregatorV3Interface private gasPriceFeed;

//     // external
//     DataTypes.ReserveConfigurationMap private tokenInfo;
//     uint256 private ltv;

//     // internal
//     uint256 private investmentAmount;
//     bool private continues;
//     StrategyStatus private status;
//     InvestStatus private investStatus;

//     // contants
//     uint256 private constant GAS_USED_DEPOSIT = 1074040;
//     uint256 private constant GAS_USED_SUPPLY = 10740;
//     uint256 private constant GAS_USED_BORROW = 10740;
//     uint256 private constant INTEREST_RATE_MODE = 2; // the borrow is always variable

//     // timestamp save the last time a contract loop was executed
//     uint256 public lastTimestamp;

//     constructor(
//         address _aavePoolAddr,
//         address _gasPriceFeedAddr,
//         address _wavaxAddr
//     ) {
//         lastTimestamp = block.timestamp;
//         aavePool = IPool(_aavePoolAddr);
//         gasPriceFeed = AggregatorV3Interface(_gasPriceFeedAddr);
//         token = IERC20(_wavaxAddr);
//     }

//     enum StrategyStatus {
//         Borrow,
//         Supply,
//         Done
//     }
//     // Repay,

//     enum InvestStatus {
//         Pristine,
//         Withdraw,
//         Transfer,
//         Active
//     }

    // struct Invest {
    //     // q.price[i] = 1100
    //     uint256 total; // 1.000.000 => 600.000  (diff => quotas => 400k)
    //     uint256 neto; // 1.000.000 (~999.990)
    //     uint256 gas; //
    //     uint256 quotas; // 200 (1ra iteración qp=1000), 202 (2da iteración qp=990), 202 (3da iteración qp=990), 200 (2da iteración qp=1000) , 181 (5ta iteración qp=1100) = 985 quotas
    // }

//     // define investments information
//     mapping(address => Invest) public _investments;
//     _investments[] public _investmentsArr;
//     EnumerableSet.AddressSet private _investmentsAddrs;

//     // define event for interacting Keeper off-chain
//     event callKeeper();

//     // method for calculating supply amount, by substracting the gas amount estimation
//     function calculateSupplyAmount(uint256 totalAmount)
//         internal
//         view
//         returns (uint256)
//     {
//         (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();

//         return
//             (totalAmount +
//                 GAS_USED_BORROW +
//                 GAS_USED_SUPPLY +
//                 GAS_USED_DEPOSIT) * (uint256(gasPrice) * 3);
//     }

//     // method for unwrap the ERC20 into the native token, in order to pay gas with that
//     function _unwrapERC20Token(uint256 amount) internal {
//         IWETH(address(token)).withdraw(amount);
//     }

//     function setLTV(uint256 _ltv) external {
//         ltv = _ltv;
//     }

//     function _getCuotaQty(uint256 amount) internal view returns (uint256) {
//         uint256 qty = amount / _getCuotaPrice();
//         return qty;
//     }

//     function _getCuotaPrice() internal pure returns (uint256) {
//         return 0;
//     }

//     // method defined for the user can make an investment, whether it is a first time or not
//     function deposit(address userAddr, uint256 amount) external payable {
//         require(
//             amount <= token.balanceOf(address(this)),
//             "balance is not enough"
//         );

//         // check if we have enough amount for paying gas
//         investmentAmount = calculateSupplyAmount(amount);

//         // if we don't, we'll unwrap the necessary gas amount of the ERC20 token
//         if (amount - investmentAmount < address(this).balance) {
//             _unwrapERC20Token(
//                 amount - investmentAmount - address(this).balance
//             );
//         }

//         // approve and supply liquidity to the protocol
//         token.approve(address(aavePool), investmentAmount);
//         aavePool.supply(address(token), investmentAmount, address(this), 0);

//         // update the status of the strategy to Borrow
//         status = StrategyStatus.Borrow;

//         // get current investment by user address
//         Invest storage i = _investments[msg.sender];

//         // use case when the user invests for the first time
//         if (i.status == InvestStatus.Pristine) {
//             i.total = amount; // TODO(nb): question: Is necessary the total amount?
//             i.neto = investmentAmount;
//             i.status = InvestStatus.Active;
//             i.quotas = _getCuotaQty(investmentAmount);
//             _investmentsAddrs.add(msg.sender);
//         } else {
//             i.total += amount;
//             i.neto += investmentAmount;
//             i.quotas += _getCuotaQty(investmentAmount);
//         }

//         emit callKeeper();
//     }

//     function borrow(address userAddr, uint256 amount) public {
//         uint256 amount = 0;
//         // for (uint i=0; i=_investmentsAddrs.length, i++){
//         //     amount += _investmentsAddrs[i].
//         // }
//         aavePool.borrow(
//             address(token),
//             amount * ltv,
//             INTEREST_RATE_MODE,
//             0,
//             address(this)
//         );

//         status = StrategyStatus.Supply;
//         emit callKeeper();
//     }

//     function supply(address userAddr, uint256 amount) public {
//         // get the gas price
//         (, int256 gasPrice, , , ) = gasPriceFeed.latestRoundData();
//         console.logInt(gasPrice);
//         console.logUint(gasleft());
//         console.logUint(gasleft() * uint256(gasPrice));

//         // approve and supply liquidity
//         token.approve(address(aavePool), amount);
//         aavePool.supply(address(token), amount, address(this), 0);

//         // update status to done, because the loop has finished
//         status = StrategyStatus.Done;
//         emit callKeeper();
//     }

//     // method for repay the borrow with collateral
//     function repayWithCollateral(uint256 amount) public {
//         aavePool.repayWithATokens(address(token), amount, INTEREST_RATE_MODE);
//     }

//     // method defined for the user can withdraw from the strategy
//     function withdraw(
//         address userAddr, // TODO(nb): question: Can we avoid this param using msg.sender??
//         uint256 quotas
//     ) external payable {
//         // get current investment by user address
//         Invest storage i = _investments[userAddr];

//         // check if user investment is active
//         require(i.status == InvestStatus.Active, "invest is not active");

//         // check if user investment has enough balance in quotas
//         require(quotas <= i.quotas, "no balance for requested quotas");

//         // TODO(ca): check overflow use case when quota is > i.quotas
//         i.quotas = i.quotas - quotas;
//         // TODO(ca): transfer amount (quota*price) to user address

//         // repay the loan using the collateral that we've
//         repayWithCollateral(quotas * price);

//         // update the status of strategy for the next step needed
//         status = StrategyStatus.Withdraw;
//         emit callKeeper();
//     }

//     function transferUser(address userAddr, uint256 amount) internal {
//         token.transfer(userAddr, amount);
//     }

//     // TODO(nb): question: remove parameter tokenAddr from IStrategy? Is not necessary here.
//     function getQuotaQty(address tokenAddr, uint256 amount)
//         external
//         view
//         returns (uint256)
//     {
//         return _getCuotaQty(amount);
//     }

//     function getQuotaPrice() external pure override returns (uint256) {
//         return _getCuotaPrice();
//     }

//     function checkUpkeep(
//         bytes calldata /* checkData */
//     )
//         external
//         view
//         override
//         returns (
//             bool upkeepNeeded,
//             bytes memory /* performData */
//         )
//     {
//         upkeepNeeded = (status != StrategyStatus.Done);
//         // &&
//         // (investStatus != InvestStatus.Active);
//     }

//     function performUpkeep(
//         bytes calldata /* performData */
//     ) external override {
//         lastTimestamp = block.timestamp;

//         //TODO(nb): use arrays for supply and withdraw operations
//         return;
//         //     if (status == StrategyStatus.Borrow) {
//         //         borrow(userAddr, amount);
//         //         return;
//         //     }
//         //     if (status == StrategyStatus.Supply) {
//         //         supply(userAddr, amount);
//         //         return;
//         //     }

//         //     if (investStatus == StrategyStatus.Withdraw) {
//         //         withdraw(userAddr, quotas);
//         //     }
//         //     if (investStatus == StrategyStatus.Transfer) {
//         //         transferUser(userAddr, amount);
//         //     }
//     }
// }
