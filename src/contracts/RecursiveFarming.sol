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
    KeeperCompatibleInterface
{
    using EnumerableSet for EnumerableSet.AddressSet;
    IPool private aavePool;
    bool private continues;
    DataTypes.ReserveConfigurationMap private tokenInfo;
    AggregatorV3Interface private priceFeed;
    uint256 private ltv;
    uint256 private investmentAmount;
    uint256 private constant gasUsedDeposit = 1074040;
    uint256 private constant gasUsedSupply = 10740;
    uint256 private constant gasUsedBorrow = 10740;

    constructor(address _aavePoolAddr, address _priceFeedAddress) {
        aavePool = IPool(_aavePoolAddr);
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    enum StrategyStatus {
        Pristine,
        Active
    }

    enum InvestStatus {
        Pristine,
        Active
    }

    struct Invest {
        uint256 total;
        uint256 neto;
        uint256 quotas;
        InvestStatus status;
    }

    struct Token {
        string name;
        address addr;
        address priceFeedAddr;
    }

    IPool private aavePool;
    bool private continues;
    DataTypes.ReserveConfigurationMap public tokenInfo;
    AggregatorV3Interface public priceFeed;
    uint256 public ltv;

    // define investments information
    mapping(address => Invest) public _investments;
    EnumerableSet.AddressSet private _investmentsAddrs;

    // define allowed tokens
    mapping(address => Token) public _tokens;
    EnumerableSet.AddressSet private _tokensAddrs;

    // timestamp save the last time a contract loop was executed
    uint256 public lastTimestamp;

    // define contracts events
    event Deposit(address userAddr, address tokenAddr, uint256 quotas);
    event Withdraw(address userAddr, address tokenAddr, uint256 quotas);

    constructor(address _aavePoolAddr, address _priceFeedAddress) {
        lastTimestamp = block.timestamp;
        aavePool = IPool(_aavePoolAddr);
        priceFeed = AggregatorV3Interface(_priceFeedAddress);
    }

    event Borrow(address userAddr, address tokenAddr, uint256 amount);
    event Supply(
        address userAddr,
        address tokenAddr,
        uint256 amount,
        bool continues
    );

    function calculateSupplyAmount(uint256 totalAmount)
        internal
        view
        returns (uint256)
    {
        (, int256 gasPrice, , , ) = priceFeed.latestRoundData();

        return
            (totalAmount + gasUsedBorrow + gasUsedDeposit + gasUsedSupply) *
            (uint256(gasPrice) * 3);
    }

    function _unwrapERC20Token(address tokenAddr, uint256 amount) internal {
        IWETH(tokenAddr).withdraw(amount);
    }

    // method defined for the user can make an investment, whether it is a first time or not
    function deposit(
        address userAddr,
        address tokenAddr,
        uint256 amount
    ) external payable {
        // check if token is supported by strategy
        require(_tokensAddrs.contains(tokenAddr), "invalid token");

        // check if user balance is enough
        IERC20 token = IERC20(tokenAddr);
        require(
            amount <= token.balanceOf(address(this)),
            "balance is not enough"
        );

        Invest storage i = _investments[userAddr];

        // get current investment by user address
        Invest storage i = _investments[msg.sender];

        // use case when the user invests for the first time
        if (i.status == InvestStatus.Pristine) {
            i.total = amount;
            i.neto = 0;
            i.status = InvestStatus.Active;
            i.quotas = _getCuotaQty(tokenAddr, amount);

            _investmentsAddrs.add(msg.sender);
        }
        investmentAmount = calculateSupplyAmount(amount);
        if (investmentAmount < address(this).balance) {
            _unwrapERC20Token(
                tokenAddr,
                amount - investmentAmount - address(this).balance
            );
        }
        IERC20(tokenAddr).approve(address(aavePool), investmentAmount);
        aavePool.supply(tokenAddr, investmentAmount, address(this), 0);

        tokenInfo = aavePool.getConfiguration(tokenAddr);
        // TODO(nb): Parse ltv from tokenInfo or change implmenetation
        ltv = 200000; // tokenInfo[:15]
        emit Deposit(address(this), tokenAddr, investmentAmount);
    }

    // method defined for the user can withdraw from the strategy
    function withdraw(
        address userAddr,
        address tokenAddr,
        uint256 quotas
    ) external payable {
        // check if token is supported by strategy
        require(_tokensAddrs.contains(tokenAddr), "invalid token");

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

        emit Withdraw(userAddr, tokenAddr, quotas);
    }

    // method defined to add support to a new erc20 token for the strategy
    function addToken(
        string memory name,
        address tokenAddr,
        address priceFeedAddr
    ) external {
        require(!_tokensAddrs.contains(tokenAddr), "token already exists");

        Token storage t = _tokens[tokenAddr];
        t.name = name;
        t.addr = tokenAddr;
        t.priceFeedAddr = priceFeedAddr;

        _tokensAddrs.add(tokenAddr);
    }

    // method defined to remove a token from the strategy
    function removeToken(address tokenAddr) external {
        delete _tokens[tokenAddr];

        _tokensAddrs.remove(tokenAddr);
    }

    function borrow(
        address userAddr,
        address tokenAddr,
        uint256 amount
    ) external {
        aavePool.borrow(tokenAddr, amount * ltv, 2, 0, address(this));
        emit Borrow(userAddr, tokenAddr, amount * ltv);
    }

    function supply(
        address userAddr,
        address tokenAddr,
        uint256 amount
    ) external {
        continues = true;
        (, int256 gasPrice, , , ) = priceFeed.latestRoundData();
        console.logInt(gasPrice);
        console.logUint(gasleft());
        console.logUint(gasleft() * uint256(gasPrice));
        if (
            amount <=
            (gasUsedSupply * 2 + gasUsedBorrow) * uint256(gasPrice) * 2
        ) {
            continues = false;
            _investments[userAddr].neto = _investments[userAddr].total - amount;
        }

        IERC20(tokenAddr).approve(address(aavePool), amount);
        aavePool.supply(tokenAddr, amount, address(this), 0);

        emit Supply(userAddr, tokenAddr, amount, continues);
    }

    function _getCuotaQty(address tokenAddr, uint256 amount)
        internal
        view
        returns (uint256)
    {
        IERC20 token = IERC20(tokenAddr);
        console.log("balance: ", token.balanceOf(address(this)));

        uint256 qty = amount / _getCuotaPrice();

        return qty;
    }

    function _getCuotaPrice() internal pure returns (uint256) {
        return 0;
    }

    function getQuotaQty(address tokenAddr, uint256 amount)
        external
        view
        returns (uint256)
    {
        return _getCuotaQty(tokenAddr, amount);
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
        // upkeepNeeded = (check if continue is true or not)
    }

    function performUpkeep(
        bytes calldata /* performData */
    ) external override {
        // if ((check if continue is true or not)) {
        //     lastTimestamp = block.timestamp;
        // }
        // recursive farming loop
        // _borrow()
        // _supply()
    }
}
