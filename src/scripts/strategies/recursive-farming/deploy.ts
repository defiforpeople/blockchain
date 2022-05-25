import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
const logger = require("pino")();

const {
  WRAPPED_NATIVE_TOKEN_ADDRESS,
  LINK_ADDRESS,
  AAVE_POOL_ADDRESS,
  GAS_DATA_FEED,
  REWARDS_EMISSION_MANAGER,
} = process.env;

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
      WRAPPED_NATIVE_TOKEN_ADDRESS,
      LINK_ADDRESS,
      REWARDS_EMISSION_MANAGER
    );
    logger.info(`Strategy contract deployed to: ${contract.address}`);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
