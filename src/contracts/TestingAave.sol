// SPDX-License-Identifier: MIT

pragma solidity ^0.8.10;

import {FlashLoanSimpleReceiverBase} from "@aave/core-v3/contracts/flashloan/base/FlashLoanSimpleReceiverBase.sol";
import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract TestingAave is FlashLoanSimpleReceiverBase {
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
        uint256 amountOwing = amount + premium;
        IERC20(asset).approve(address(POOL), amountOwing);

        return true;
    }

    function flashloan(address _asset, uint256 _amount)
        external
        returns (uint256)
    {
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

        return address(this).balance;
    }

    // function ADDRESSES_PROVIDER()
    //     external
    //     view
    //     returns (IPoolAddressesProvider);

    // function POOL() external view returns (IPool);
}
//     uint256 public tokenPercentage;
//     uint256 public totalSupplyAmount;
//     uint256 public flashloanAmount;
//     uint256 public ltv;
//     uint256 public maxAvailableAmount;
//     address public aavePool;

//     function calculateFlashloanAmount(
//         uint256 _amount,
//         uint256 _ltv,
//         uint256 _flashloanFee
//     ) internal returns (uint256) {
//         tokenPercentage = 100 - (_ltv * 100);
//         totalSupplyAmount = (_amount * tokenPercentage) / 100;
//         flashloanAmount = (_ltv * totalSupplyAmount) / 100;
//         return flashloanAmount - _flashloanFee;
//     }

//     function askFlashloan(address tokenAddr, uint256 _amount) internal {
//         // Ask flashloan on Aave
//         // flashLoan( address receiverAddress, address[] calldata assets, uint256[] calldata amounts, uint256[] interestRateModes, address onBehalfOf, bytes calldata params, uint16 referralCode)
//     }

//     function repayFlashloan(address tokenAddr, uint256 _amount) internal {
//         // Give back the flashloan
//     }

//     event Success(
//         address tokenAddr,
//         uint256 userAddr,
//         uint256 amount,
//         bool success
//     );

//     struct Investment {
//         address tokenAddr;
//         uint256 amount;
//         uint256 flashloanAmount;
//         bool success;
//     }
//     mapping(address => Investment) public investments;

//     function startStrategy(address tokenAddr, uint256 _amount) external {
//         require(_amount > 0, "Amount must be greater than 0");
//         (ltv, maxAvailableAmount) = getConfiguration(tokenAddr);
//         require(
//             ltv > 0 && maxAvailableAmount > 0,
//             "LTV & available liquidity must be greater than 0"
//         );

//         flashloanFee = aavePool.FLASHLOAN_PREMIUM_TOTAL();
//         flashloanAmount = calculateFlashloanAmount(_amount, ltv, flashloanFee);
//         askFlashloan(tokenAddr, flashloanAmount);
//         // aavePool.supplyWithPermit(tokenAddr, _amount + flashloanAmount, address(this), 0, uint256 deadline, uint8 permitV, bytes32 permitR, bytes32 permitS);
//         aavePool.borrow(tokenAddr, FlashloanAmount, 2, 0, address(this));
//         repayFlashloan(tokenAddr, FlashloanAmount);

//         emit Success(tokenAddr, msg.sender, _amount + flashloanAmount, true);
//         investments[msg.sender] = Investment(
//             tokenAddr,
//             _amount,
//             flashloanAmount,
//             true
//         );
//     }

//     function closeStrategy(address userAddr) external {
//         require(investments[msg.sender], "Investment not found");
//         (tokenAddr, amount, flashloanAmount, _) = investments[msg.sender];
//         askFlashloan(tokenAddr, flashloanAmount);
//         aavePool.repayWithATokens(tokenAddr, flashloanAmount, 2);

//         aavePool.withdraw(tokenAddr, amount + flashloanAmount, address(this));
//         repayFlashloan(tokenAddr, flashloanAmount);
//         token.transfer(userAddr, amount);
//     }
// }
