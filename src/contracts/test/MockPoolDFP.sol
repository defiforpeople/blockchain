// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.10;

import {IPoolAddressesProvider} from "@aave/core-v3/contracts/interfaces/IPoolAddressesProvider.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract MockPoolDFP {
    // Reserved storage space to avoid layout collisions.
    uint256[100] private ______gap;

    address internal _addressesProvider;
    address[] internal _reserveList;

    uint256 public totalCollateralBase;
    uint256 public totalDebtBase;
    uint256 public availableBorrowsBase;
    uint256 public currentLiquidationThreshold;
    uint256 public ltv;
    uint256 public healthFactor;

    function initialize(address provider) external {
        _addressesProvider = provider;
    }

    function addReserveToReservesList(address reserve) external {
        _reserveList.push(reserve);
    }

    function getReservesList() external view returns (address[] memory) {
        address[] memory reservesList = new address[](_reserveList.length);
        for (uint256 i; i < _reserveList.length; i++) {
            reservesList[i] = _reserveList[i];
        }
        return reservesList;
    }

    function getAddressesProvider() external view returns (address) {
        return _addressesProvider;
    }

    function setUserAccountData(
        uint256 _totalCollateralBase,
        uint256 _totalDebtBase,
        uint256 _availableBorrowsBase,
        uint256 _currentLiquidationThreshold,
        uint256 _ltv,
        uint256 _healthFactor
    ) external {
        totalCollateralBase = _totalCollateralBase;
        totalDebtBase = _totalDebtBase;
        availableBorrowsBase = _availableBorrowsBase;
        currentLiquidationThreshold = _currentLiquidationThreshold;
        ltv = _ltv;
        healthFactor = _healthFactor;
    }

    function getUserAccountData(address user)
        external
        view
        returns (
            uint256 totalCollateralBase,
            uint256 totalDebtBase,
            uint256 availableBorrowsBase,
            uint256 currentLiquidationThreshold,
            uint256 ltv,
            uint256 healthFactor
        )
    {}

    function supply(
        address asset,
        uint256 amount,
        address onBehalfOf,
        uint16 referralCode
    ) external {
        require(
            IERC20(asset).balanceOf(msg.sender) >= amount,
            "Not enough amount"
        );
        IERC20(asset).transferFrom(onBehalfOf, address(this), amount);
    }

    function borrow(
        address asset,
        uint256 amount,
        uint256 interestRateMode,
        uint16 referralCode,
        address onBehalfOf
    ) external {
        require(
            IERC20(asset).balanceOf(msg.sender) >= amount,
            "Fund this mock contract with the amount"
        );
        IERC20(asset).transfer(onBehalfOf, amount);
    }

    function withdraw(
        address asset,
        uint256 amount,
        address to
    ) external {
        require(
            IERC20(asset).balanceOf(msg.sender) >= amount,
            "Fund this mock contract with the amount"
        );
        IERC20(asset).transfer(to, amount);
    }

    function repayWithATokens(
        address asset,
        uint256 amount,
        uint256 interestRateMode
    ) external {
        require(
            IERC20(asset).balanceOf(msg.sender) >= amount,
            "Not enough amount"
        );
        IERC20(asset).transferFrom(address(msg.sender), address(this), amount);
    }
}
