// SPDX-License-Identifier: MIT
pragma solidity ^0.8.10;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/structs/EnumerableSet.sol";
import "./IStrategy.sol";
import "hardhat/console.sol";

contract Main is Ownable {
    using EnumerableSet for EnumerableSet.AddressSet;

    struct Strategy {
        string name;
        address addr;
    }

    mapping(address => Strategy) private _strategies;
    EnumerableSet.AddressSet private _strategiesAddrs;

    event Deposit(
        address indexed userAddr,
        address indexed strategyAddr,
        uint256 amount
    );
    event Withdraw(
        address indexed userAddr,
        address indexed strategyAddr,
        uint256 amount
    );
    event AddStrategy(address indexed strategyAddr, string name);
    event DeleteStrategy(address indexed strategyAddr);

    constructor() {}

    function deposit(address strategyAddr, uint256 amount)
        external
        returns (bool)
    {
        emit Deposit(msg.sender, strategyAddr, amount);
        return true;
    }

    function withdraw(address strategyAddr, uint256 amount)
        external
        returns (bool)
    {
        emit Withdraw(msg.sender, strategyAddr, amount);
        return true;
    }

    function addStrategy(address addr, string memory name) external {
        Strategy storage s = _strategies[addr];
        s.name = name;
        s.addr = addr;

        _strategiesAddrs.add(addr);

        emit AddStrategy(addr, name);
    }

    function deleteStrategy(address addr) external {
        delete _strategies[addr];

        _strategiesAddrs.remove(addr);

        emit DeleteStrategy(addr);
    }

    function getStrategies()
        external
        view
        returns (string[] memory, address[] memory)
    {
        address[] memory values = _strategiesAddrs.values();

        string[] memory names = new string[](values.length);
        address[] memory addrs = new address[](values.length);
        for (uint256 i = 0; i < values.length; i++) {
            address addr = values[i];

            Strategy memory s = _strategies[addr];
            names[i] = s.name;
            addrs[i] = s.addr;
        }

        return (names, addrs);
    }

    function getCuotaByStrategy(address strategyAddr)
        external
        view
        returns (uint256)
    {
        return IStrategy(strategyAddr).getQuotaPrice();
    }
}
