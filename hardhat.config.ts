import * as dotenv from "dotenv";

import { HardhatUserConfig, task, subtask } from "hardhat/config";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";

import * as main from "./src/utils/main";
import * as strategy from "./src/utils/strategy";

import pino from "pino";
const logger = pino();

const found = process.argv.indexOf("--network");
const networkName = process.argv[found + 1];
if (!networkName) {
  throw new Error("invalid network name");
}

console.log("network", networkName);
dotenv.config({
  path: `.env.${networkName}`,
});

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("dfp-main", "Run main contract tasks")
  .addPositionalParam("action", "The contract action")
  .addOptionalParam("mainAddr", "optional: address of the main contract")
  .addOptionalParam("strategyName", "The name of the strategy")
  .addOptionalParam(
    "strategyAddr",
    "optional: address of the strategy contract"
  )
  .setAction(async (taskArgs, { run }) => {
    switch (taskArgs.action) {
      case "get-strategies": {
        await run("dfp-main-get-strategies", { ...taskArgs });
        break;
      }

      case "add-strategy": {
        await run("dfp-main-add-strategy", { ...taskArgs });
        break;
      }

      case "delete-strategy": {
        await run("dfp-main-delete-strategy", { ...taskArgs });
        break;
      }

      default:
        logger.error("invalid main contract action");
    }
  });

subtask("dfp-main-get-strategies", "Get strategies of main contract")
  .addOptionalParam("mainAddr", "The address of main contract")
  .setAction(async ({ mainAddr }, { ethers }) => {
    // define main contract
    const contract = await main.getOrDeployContract(ethers, mainAddr);

    // get strategies
    const [names, addreses] = await contract.getStrategies();
    const strategies = names.reduce(
      (arr: { name: string; address: string }[], name, index) => {
        const address = addreses[index];
        return [...arr, { name, address }];
      },
      []
    );

    console.log("Strategies: ", strategies);
  });

subtask("dfp-main-add-strategy", "Add strategy to main contract")
  .addOptionalParam("mainAddr", "The address of main contract")
  .addParam("strategyName", "The name of the strategy")
  .addParam("strategyAddr", "The address of the strategy contract")
  .setAction(async ({ mainAddr, strategyName, strategyAddr }, { ethers }) => {
    // define main contract
    const contract = await main.getOrDeployContract(ethers, mainAddr);

    // create strategy
    await main.addStrategy(
      ethers,
      contract.address,
      strategyAddr,
      strategyName
    );
    console.log(
      `Created strategy name=${strategyName} address=${strategyAddr}`
    );
  });

subtask("dfp-main-delete-strategy", "Delete strategy to main contract")
  .addOptionalParam("mainAddr", "The address of main contract")
  .addParam("strategyAddr", "The address of the strategy contract")
  .setAction(async ({ mainAddr, strategyAddr }, { ethers }) => {
    // define main contract
    const contract = await main.getOrDeployContract(ethers, mainAddr);

    // delete strategy
    await main.deleteStrategy(ethers, contract.address, strategyAddr);
    console.log(`Deleted strategy address=${strategyAddr}`);
  });

task("dfp-strategy", "Run strategy contract tasks")
  .addPositionalParam("strategyName", "The name of the strategy")
  .addPositionalParam("action", "The contract action")
  .addOptionalParam("mainAddr", "optional: address of the main contract")
  .addOptionalParam(
    "strategyAddr",
    "optional: address of the strategy contract"
  )
  .setAction(async (taskArgs, { run }) => {
    switch (taskArgs.action) {
      case "deposit": {
        await run("dfp-strategy-deposit", { ...taskArgs });
        break;
      }

      case "withdraw": {
        await run("dfp-strategy-withdraw", { ...taskArgs });
        break;
      }

      default:
        logger.error("invalid strategy contract action");
    }
  });

subtask("dfp-strategy-deposit", "Deposit to strategy")
  .addParam("strategyAddr", "The address of strategy contract")
  .addParam("userAddr", "The address of user wallet")
  .addParam("tokenAddr", "The address of token contract")
  .addParam("amount", "The amount of deposit")
  .setAction(
    async ({ strategyAddr, userAddr, tokenAddr, amount }, { ethers }) => {
      // define strategy contract
      const contract = await strategy.recursiveFarming.getOrDeployContract(
        ethers,
        strategyAddr
      );

      // deposit
      await strategy.recursiveFarming.deposit(
        ethers,
        contract.address,
        userAddr,
        tokenAddr,
        amount
      );

      console.log(
        `Deposit success for user=${userAddr} token=${tokenAddr} amount=${amount} `
      );
    }
  );

subtask("dfp-strategy-withdraw", "Withdraw from strategy")
  .addParam("strategyAddr", "The address of strategy contract")
  .addParam("userAddr", "The address of user wallet")
  .addParam("tokenAddr", "The address of token contract")
  .addParam("amount", "The amount of the withdraw")
  .setAction(
    async ({ strategyAddr, userAddr, tokenAddr, amount }, { ethers }) => {
      // define strategy contract
      const contract = await strategy.recursiveFarming.getOrDeployContract(
        ethers,
        strategyAddr
      );

      // withdraw
      await strategy.recursiveFarming.withdraw(
        ethers,
        contract.address,
        userAddr,
        tokenAddr,
        amount
      );

      console.log(
        `Withdraw success for user=${userAddr} token=${tokenAddr} amount=${amount} `
      );
    }
  );

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
console.log("process.env.PRIVATE_KEY ", process.env.PRIVATE_KEY);
console.log("process.env.URL ", process.env.URL);
const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.4",
      },
      {
        version: "0.8.9",
      },
      {
        version: "0.8.10",
      },
      {
        version: "0.8.9",
      },
    ],
  },
  networks: {
    ropsten: {
      url: process.env.URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
    rinkeby: {
      url: process.env.URL || "",
      accounts:
        process.env.PRIVATE_KEY !== undefined ? [process.env.PRIVATE_KEY] : [],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY,
  },
  paths: {
    root: "./src",
  },
  typechain: {
    outDir: "./typechain",
    target: "ethers-v5",
    alwaysGenerateOverloads: false,
    externalArtifacts: ["externalArtifacts/*.json"],
  },
};

export default config;
