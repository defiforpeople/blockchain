// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract FlashloanFarming is FlashLoanReceiverBase {
    function getTokenInfo(address _token) internal returns (uint256, uint256) {
        // Get LTV & max available liquidity
    }

    function calculateFlashloanAmount(uint256 _amount, uint256 ltv)
        internal
        returns (uint256)
    {
        tokenPercentage = 100 - (ltv * 100);
        totalSupplyAmount = (_amount * tokenPercentage) / 100;
        flashloanAmount = (ltv * totalSupplyAmount) / 100;
        return flashloanAmount;
    }

    function askFlashloan(address tokenAddr, uint256 _amount) internal {
        // Ask flashloan on Aave
    }

    function supplyLiquidity(address tokenAddr, uint256 _amount) internal {
        // supplyWithPermit() on Aave
    }

    function borrowLiquidity(address tokenAddr, uint256 _amount) internal {
        // borrow() on Aave
    }

    function repayFlashloan(address tokenAddr, uint256 _amount) internal {
        // Give back the flashloan
    }

    event Success(address tokenAddr, uint256 userAddr, uint256 _amount);

    function exectureOperation(address tokenAddr, uint256 _amount) external {
        require(_amount > 0, "Amount must be greater than 0");

        (ltv, maxAvailableAmount) = getTokenInfo(tokenAddr);
        require(
            ltv > 0 && maxAvailableAmount > 0,
            "LTV & available liquidity must be greater than 0"
        );

        flashloanAmount = calculateFlashloanAmount(_amount, ltv);
        askFlashloan(tokenAddr, flashloanAmount);
        supplyLiquidity(tokenAddr, _amount + flashloanAmount);
        borrowLiquidity(tokenAddr, FlashloanAmount);
        repayFlashloan(tokenAddr, FlashloanAmount);

        emit Success(tokenAddr, msg.sender, _amount + flashloanAmount);
    }
}
