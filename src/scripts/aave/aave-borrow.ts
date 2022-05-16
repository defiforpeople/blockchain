import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
import {
  // eslint-disable-next-line camelcase
  IPool__factory,
  IPool,
  // eslint-disable-next-line camelcase
  IERC20__factory,
  IERC20,
} from "../../typechain";
const logger = require("pino")();

// get ENV values
const { WETH_ADDRESS, AAVE_POOL_ADDRESS } = process.env;
if (!WETH_ADDRESS || !AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

// TODO(nb): Should get the max amount to borrow in GetUserData
const GAS_LIMIT = 2074040;
const MAX_AMOUNT = 0.0000628;
const AMOUNT = ethers.utils.parseEther(`${MAX_AMOUNT / 2}`);

export default async function borrow(
  aavePoolAddress: string,
  tokenAddress: string,
  amount: BigNumber
) {
  // get wallet from provider
  const [wallet] = await ethers.getSigners();

  // define instance of erc20 token
  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    tokenAddress
  )) as IERC20;

  // define instance of aave pool
  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  // make borrow tx to aave pool contact and wait confirmation
  logger.info("Borrowing...");
  const tx = await aavePool.borrow(
    token.address,
    amount,
    2, // 1: stable | 2: variable
    0,
    wallet.address,
    {
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    }
  );
  await tx.wait();
}

// run script
(async () => {
  try {
    await borrow(AAVE_POOL_ADDRESS, WETH_ADDRESS, AMOUNT);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
