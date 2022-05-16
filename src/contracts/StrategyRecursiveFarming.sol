// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "@openzeppelin/contracts/security/Pausable.sol";
import "./IStrategy.sol";
import "hardhat/console.sol";

contract StrategyRecursiveFarming is IStrategy, Pausable {
    using EnumerableSet for EnumerableSet.AddressSet;

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

    address private aavePoolAddr;

    mapping(address => Invest) public _investments;
    EnumerableSet.AddressSet private _investmentsAddrs;

    mapping(address => Token) public _tokens;
    EnumerableSet.AddressSet private _tokensAddrs;

    event Deposit(address userAddr, address tokenAddr, uint256 quotas);
    event Withdraw(address userAddr, address tokenAddr, uint256 quotas);

    constructor() {}

    function deposit(
        address userAddr,
        address tokenAddr,
        uint256 amount
    ) external payable {
        // TODO(ca): check tokenAddr input in Set
        Invest storage i = _investments[userAddr];

        // first time
        if (i.status == InvestStatus.Pristine) {
            i.total = amount;
            i.neto = 0;
            i.status = InvestStatus.Active;
            i.quotas = _getCuotaQty(tokenAddr, amount);

            _investmentsAddrs.add(userAddr);
        }

        emit Deposit(userAddr, tokenAddr, amount);
    }

    function withdraw(
        address userAddr,
        address tokenAddr,
        uint256 quotas
    ) external payable {
        // TODO(ca): check tokenAddr input in Set

        Invest storage i = _investments[userAddr];

        require(i.status == InvestStatus.Active, "invest is not active");
        require(quotas <= i.quotas, "no balance for requested quotas");

        // TODO(ca): check overflow use case when quota is > i.quotas
        i.quotas = i.quotas - quotas;

        emit Withdraw(userAddr, tokenAddr, quotas);
    }

    function addToken(
        string memory name,
        address tokenAddr,
        address priceFeedAddr
    ) external {
        Token storage t = _tokens[tokenAddr];
        t.name = name;
        t.addr = tokenAddr;
        t.priceFeedAddr = priceFeedAddr;

        _tokensAddrs.add(tokenAddr);
    }

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
}
