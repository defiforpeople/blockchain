import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { StrategyRecursiveFarming } from "../../../typechain";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// function for user to request withdraw
export async function reqWithdraw(userAddr: string): Promise<void> {
  // get strategy contract
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyContract.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

  try {
    // get the max amount of quotas of the user from withdraw
    const quotaQty = await strategy.quotasPerAddress();
    logger.info(`The actual quota is ${quotaQty}`);

    // execute requestWithdraw from user address and with the amount to withdraw
    logger.info("Executing requestWithdraw...");
    const reqTx = await strategy.requestWithdraw(quotaQty, {
      from: userAddr,
      gasLimit: GAS_LIMIT,
    });
    await reqTx.wait();
    logger.info("requestWithdraw executed");
  } catch (err) {
    logger.error(err);
  }
}
