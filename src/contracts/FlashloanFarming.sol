//SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeMath} from "@aave/core-v3/contracts/dependencies/openzeppelin/contracts/SafeMath.sol";

contract FlashloanFarming is FlashLoanSimpleReceiverBase {
    using SafeMath for uint256;

    uint256 private tokenPercentage;
    uint256 private totalSupplyAmount;
    uint256 private flashloanAmount;
    uint256 private flashloanFee;
    uint256 private ltv;
    uint256 private amount;
    uint256 private maxAvailableAmount;
    // address private POOL;
    address private tokenAddr;
    bytes32 private aaveTokenResponse;

    constructor(IPoolAddressesProvider _addressProvider)
        FlashLoanSimpleReceiverBase(_addressProvider)
    {}

    function executeOperation(
        address asset,
        uint256 amount,
        uint256 premium,
        address initiator,
        bytes calldata params
    ) external returns (bool) {
        uint256 amountOwing = amount.add(premium);
        IERC20(asset).approve(address(POOL), amountOwing);

        return true;
    }

    function askFlashloan(address _asset, uint256 _amount) internal {
        address receiverAddress = address(this);
        bytes memory params = "";
        uint16 referralCode = 0;
        POOL.flashLoanSimple(
            receiverAddress,
            _asset,
            _amount,
            params,
            referralCode
        );
    }

    function calculateFlashloanAmount(
        uint256 _amount,
        uint256 _ltv,
        uint256 _flashloanFee
    ) internal returns (uint256) {
        tokenPercentage = 100 - (_ltv * 100);
        totalSupplyAmount = (_amount * tokenPercentage) / 100;
        flashloanAmount = (_ltv * totalSupplyAmount) / 100;
        return flashloanAmount - _flashloanFee;
    }

    event Success(
        address tokenAddr,
        uint256 userAddr,
        uint256 amount,
        bool success
    );

    struct Investment {
        address tokenAddr;
        uint256 amount;
        uint256 flashloanAmount;
        bool success;
    }
    mapping(address => Investment) public investments;

    function startStrategy(address _tokenAddr, uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");
        // (ltv, maxAvailableAmount) = POOL.getConfiguration(_tokenAddr);
        aaveTokenResponse = POOL.getConfiguration(_tokenAddr);
        require(
            ltv > 0 && maxAvailableAmount > 0,
            "LTV & available liquidity must be greater than 0"
        );

        flashloanFee = POOL.FLASHLOAN_PREMIUM_TOTAL();
        flashloanAmount = calculateFlashloanAmount(_amount, ltv, flashloanFee);
        askFlashloan(_tokenAddr, flashloanAmount);
        POOL.supplyWithPermit(
            _tokenAddr,
            _amount + flashloanAmount,
            address(this),
            0
        ); // uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS);
        POOL.borrow(_tokenAddr, flashloanAmount, 2, 0, address(this));

        emit Success(_tokenAddr, msg.sender, _amount + flashloanAmount, true);
        investments[msg.sender] = Investment(
            _tokenAddr,
            _amount,
            flashloanAmount,
            true
        );
    }

    function closeStrategy(address userAddr) external {
        require(investments[msg.sender], "Investment not found");
        (tokenAddr, amount, flashloanAmount, , ) = investments[msg.sender];
        askFlashloan(tokenAddr, flashloanAmount);
        POOL.repayWithATokens(tokenAddr, flashloanAmount, 2);

        POOL.withdraw(tokenAddr, amount + flashloanAmount, address(this));
        IERC20(tokenAddr).transfer(userAddr, amount);
    }
}
