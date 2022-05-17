import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
const logger = require("pino")();

// get ENV values
const { WETH_ADDRESS, AAVE_POOL_ADDRESS } = process.env;
if (!WETH_ADDRESS || !AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

(async () => {
  try {
    const TestingAaveContract = await ethers.getContractFactory("TestingAave");
    console.log(process.env.AAVE_POOL_ADDRESS);
    const TestingAave = await TestingAaveContract.deploy(
      process.env.AAVE_POOL_ADDRESS
    );
    await TestingAave.deployed();
    return TestingAave;
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
