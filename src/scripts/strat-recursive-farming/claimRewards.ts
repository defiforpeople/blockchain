import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { StrategyRecursiveFarming } from "../../typechain";
import { sleep, day } from "../../utils/helpers/sleep";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// method for claiming rewards tokens from aave to the strategy contract
export async function claimRewardToken(): Promise<void> {
  // get owner wallet
  const [wallet] = await ethers.getSigners();

  // get strategy contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  try {
    // claim the rewards from aave
    logger.info("Claiming rewards ...");
    const tx = await strategy.claimRewards({
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();
    logger.info(`rewards claimed`);
  } catch (err) {
    console.error(err);
  }
}
