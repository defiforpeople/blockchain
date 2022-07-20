import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { IPool__factory, IPool } from "../../typechain";
const logger = require("pino")();

// get ENV values
const { AAVE_POOL_ADDRESS } = process.env;
if (!AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

export default async function getUserDataAave(asset: string) {
  // define instance of aave pool
  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    AAVE_POOL_ADDRESS!
  )) as IPool;

  const normalizedIncome = await aavePool.getReserveNormalizedIncome(asset);
  logger.info(`normalizedIncome: ${normalizedIncome}`);
}
