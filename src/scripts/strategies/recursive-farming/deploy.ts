import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
const logger = require("pino")();

const {
  WRAPPED_NATIVE_TOKEN_ADDRESS,
  AAVE_POOL_ADDRESS,
  GAS_DATA_FEED,
  REWARDS_EMISSION_MANAGER,
} = process.env;

// run script for deploy
(async () => {
  try {
    const keeperInterval = 300; // seconds
    logger.info(`Deploying the contract...`);
    const StrategyContract = await ethers.getContractFactory(
      "StrategyRecursiveFarming"
    );
    const contract = await StrategyContract.deploy(
      AAVE_POOL_ADDRESS,
      GAS_DATA_FEED,
      WRAPPED_NATIVE_TOKEN_ADDRESS,
      REWARDS_EMISSION_MANAGER,
      keeperInterval
    );
    logger.info(`Strategy contract deployed to: ${contract.address}`);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
