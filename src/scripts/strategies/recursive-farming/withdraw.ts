import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
// eslint-disable-next-line camelcase
import { StrategyRecursiveFarming } from "../../../typechain";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// function for user to request withdraw
export async function reqWithdraw(
  userAddr: string,
  amount: BigNumber
): Promise<void> {
  // get the wallet owner
  const [wallet] = await ethers.getSigners();

  // get strategy contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  try {
    // execute requestWithdraw from user address and with the amount to withdraw
    logger.info("Executing requestWithdraw");
    const reqTx = await strategy.requestWithdraw(amount, {
      from: userAddr,
      gasLimit: GAS_LIMIT,
    });
    await reqTx.wait();

    // after it finishes, it calls the withdraw function in the contract for withdraw that amount of aave ans transfer it to user address
    await logger.info("Executing Withdraw");
    // TODO(nb): try to do it with events
    const withdrawTx = await strategy.withdraw(userAddr, amount, {
      from: wallet.address,
      // TODO(nb): question: is possible to sign this tx with the user address too?
      gasLimit: GAS_LIMIT,
    });
    await withdrawTx.wait();
    await logger.info(withdrawTx);
  } catch (err) {
    logger.error(err);
  }
}
