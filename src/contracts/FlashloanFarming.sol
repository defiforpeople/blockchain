// SPDX-License-Identifier: MIT

pragma solidity ^0.8.0;

contract FlashloanFarming is FlashLoanReceiverBase {
    uint256 public tokenPercentage;
    uint256 public totalSupplyAmount;
    uint256 public flashloanAmount;
    uint256 public ltv;
    uint256 public maxAvailableAmount;

    function getTokenInfo(address _token) internal returns (uint256, uint256) {
        // Get LTV & max available liquidity
    }

    function calculateFlashloanAmount(uint256 _amount, uint256 _ltv)
        internal
        returns (uint256)
    {
        tokenPercentage = 100 - (_ltv * 100);
        totalSupplyAmount = (_amount * tokenPercentage) / 100;
        flashloanAmount = (_ltv * totalSupplyAmount) / 100;
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

    function repayLiquidity(address tokenAddr, uint256 _amount) internal {
        // repay() on Aave
    }

    function repayFlashloan(address tokenAddr, uint256 _amount) internal {
        // Give back the flashloan
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

    function startStrategy(address tokenAddr, uint256 _amount) external {
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

        emit Success(tokenAddr, msg.sender, _amount + flashloanAmount, true);
        investments[msg.sender] = Investment(
            tokenAddr,
            _amount,
            flashloanAmount,
            true
        );
    }

    function closeStrategy(address userAddr) external {
        require(investments[msg.sender], "Investment not found");
        (tokenAddr, amount, flashloanAmount, _) = investments[msg.sender];
        askFlashloan(tokenAddr, flashloanAmount);
        repayLiquidity(tokenAddr, flashloanAmount);
        withdrawLiquidity(tokenAddr, flashloanAmount);
        repayFlashloan(tokenAddr, flashloanAmount);
        token.transfer(userAddr, amount);
    }
}
