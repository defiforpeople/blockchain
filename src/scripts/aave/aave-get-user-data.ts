import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool } from "../../typechain";
const logger = require("pino")();

// get ENV values
const { AAVE_POOL_ADDRESS } = process.env;
if (!AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

export default async function getUserDataAave(aavePoolAddress: string) {
  // get wallet from provider
  const [wallet] = await ethers.getSigners();

  // define instance of aave pool
  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  const userData = await aavePool.getUserAccountData(wallet.address);
  logger.info(`userData: ${userData}`);

  const userConfig = await aavePool.getUserConfiguration(wallet.address);
  logger.info(`userConfi: ${userConfig}`);

  const assetConfig = await aavePool.getConfiguration(wallet.address);
  logger.info(`assetConfi: ${assetConfig}`);
}

// run script
(async () => {
  try {
    await getUserDataAave(AAVE_POOL_ADDRESS);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
