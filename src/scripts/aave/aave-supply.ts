import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";
import {
  // eslint-disable-next-line camelcase
  IPool__factory,
  IPool,
  IERC20,
  // eslint-disable-next-line camelcase
  IERC20__factory,
} from "../../typechain";
const logger = require("pino")();

// get ENV values
const { WETH_ADDRESS, AAVE_POOL_ADDRESS } = process.env;
if (!WETH_ADDRESS || !AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

// define constants values
const GAS_LIMIT = 2074040;
const MAX_AMOUNT = 0.0064423; // TODO(nb): Should get the max amount to borrow in GetUserData
const AMOUNT = parseEther(`${MAX_AMOUNT / 2}`);

export default async function supply(
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

  // make approve tx to erc20 token contract and wait confirmation
  logger.info("Approving...");
  const tx = await token.approve(aavePool.address, amount, {
    from: wallet.address,
    gasLimit: GAS_LIMIT,
  });
  tx.wait();

  // make supply tx to aave pool contract and wait confirmation
  logger.info("Supplying...");
  const supTx = await aavePool.supply(
    token.address,
    amount,
    wallet.address,
    0,
    {
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    }
  );
  await supTx.wait();
}

// TODO(nb): Get Eth/DAI price from Chainlink oracle
// const maxDai = 1;
// const ethDaiPrice = 1900;
// const amount = ethers.utils.parseEther(`${maxDai / ethDaiPrice}`);
// const rinkebyDAI = "0x4aAded56bd7c69861E8654719195fCA9C670EB45";

// run script
(async () => {
  try {
    await supply(AAVE_POOL_ADDRESS, WETH_ADDRESS, AMOUNT);
  } catch (err) {
    logger.error(err);
    process.exitCode = 1;
  }
})();
