// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import {IStrategy} from "./IStrategy.sol";
import {IPool} from "@aave/core-v3/contracts/interfaces/IPool.sol";
import {AggregatorV3Interface} from "@chainlink/contracts/src/v0.8/interfaces/AggregatorV3Interface.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "@openzeppelin/contracts/utils/math/SafeMath.sol";

// errors
error Error__NotEnoughBalance(uint256 balance);
error Error__NotEnoughQuotas(uint256 quotas, uint256 requestedQuotas);
error Error__AmountIsZero();

contract SupplyAave is IStrategy, Ownable {
    using SafeMath for uint256;

    IERC20 public immutable token;
    IPool public immutable aavePool;
    AggregatorV3Interface public immutable gasPriceFeed;
    uint16 public referralCode = 0;

    // define investments information
    mapping(address => uint256) private _investments;

    // TODO: add implementation for using multiple ERC20 tokens
    constructor(
        address _token,
        address _aavePool,
        address _gasPriceFeed
    ) {
        token = IERC20(_token);
        aavePool = IPool(_aavePool);
        gasPriceFeed = AggregatorV3Interface(_gasPriceFeed);
    }

    modifier checkAmount(uint256 amount) {
        if (amount == 0) {
            revert Error__AmountIsZero();
        }
        _;
    }

    function supply(uint256 _amount) external checkAmount(_amount) {
        if (token.balanceOf(msg.sender) < _amount || _amount == 0) {
            revert Error__NotEnoughBalance(token.balanceOf(msg.sender));
        }

        token.transferFrom(msg.sender, address(this), _amount);

        aavePool.supply((address(token)), _amount, address(this), referralCode);

        uint256 quotas = _getQuotaQty(_amount);

        emit Deposit(msg.sender, _amount, quotas);
    }

    function withdraw(uint256 _quotasAmm) external checkAmount(_quotasAmm) {
        uint256 userQuotas = _investments[msg.sender];
        if (userQuotas == 0 || _quotasAmm > userQuotas) {
            revert Error__NotEnoughQuotas(userQuotas, _quotasAmm);
        }

        uint256 amount = _getAmountFromQuotas(_quotasAmm);
        // withdraw token amount from aave, to the userAddr
        aavePool.withdraw(address(token), amount, msg.sender);
        emit Withdraw(msg.sender, amount, _quotasAmm);
    }

    function getQuotaQty(uint256 amount) external view returns (uint256) {
        return _getQuotaQty(amount);
    }

    function _getQuotaQty(uint256 amount) internal view returns (uint256) {
        return amount / 2;
    }

    function getAmountFromQuotas(uint256 quotas)
        external
        view
        returns (uint256)
    {
        return _getAmountFromQuotas(quotas);
    }

    function _getAmountFromQuotas(uint256 quotas)
        internal
        view
        returns (uint256)
    {
        return quotas * 2;
    }

    function getQuotaPrice() external view returns (uint256) {
        return 1;
    }
}
