// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "@chainlink/contracts/src/v0.8/KeeperCompatible.sol";
import "./IStrategy.sol";
import "hardhat/console.sol";

contract StrategyRecursiveFarming is
    IStrategy,
    Pausable,
    KeeperCompatibleInterface
{
    using EnumerableSet for EnumerableSet.AddressSet;

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

    // define aave pool used for strategy
    address private aavePoolAddr;

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

    constructor() {
        lastTimestamp = block.timestamp;
    }

    // method defined for the user can make an investment, whether it is a first time or not
    function deposit(address tokenAddr, uint256 amount) external payable {
        // check if token is supported by strategy
        require(_tokensAddrs.contains(tokenAddr), "invalid token");

        // check if user balance is enough
        IERC20 token = IERC20(tokenAddr);
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
            i.quotas = _getCuotaQty(tokenAddr, amount);

            _investmentsAddrs.add(msg.sender);
        }

        emit Deposit(msg.sender, tokenAddr, amount);
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
