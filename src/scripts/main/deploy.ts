import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import * as main from "../../utils/main";
const logger = require("pino")();

// run script
(async () => {
  try {
    const contract = await main.deployContract(ethers);
    logger.info(`Main contract deployed to: ${contract.address}`);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
