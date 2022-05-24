import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
const logger = require("pino")();

const { WETH_ADDRESS, AAVE_POOL_ADDRESS, GAS_DATA_FEED } = process.env;

// run script
(async () => {
  try {
    logger.info(`Deploying the contract...`);
    const StrategyContract = await ethers.getContractFactory(
      "StrategyRecursiveFarming"
    );
    const contract = await StrategyContract.deploy(
      AAVE_POOL_ADDRESS,
      GAS_DATA_FEED,
      WETH_ADDRESS
    );
    logger.info(`Strategy contract deployed to: ${contract.address}`);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
