import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { StrategyRecursiveFarming } from "../../../typechain";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// TODO(nb): implement cron jobs for execuitng doRecursion() automatically
// method for executing recursion based on the contract status (supply or borrow)
export async function doRecursion(): Promise<void> {
  // get the owner wallet
  const [wallet] = await ethers.getSigners();

  // get the contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

  try {
    // define constants for possible smart contract status
    const borrow = 0;
    const supply = 1;
    const done = 2;

    // print the strategy status
    let strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);

    // if the status is done, recursion is not necessary
    if (strategyStatus === done) {
      logger.info("The strategy is in DONE status");
      return;
    }

    // // TODO(nb): question: don't know if calculating the owner wallet gas is necessary
    // if (
    //   (await strategy.gasNeeded({
    //     from: wallet.address,
    //     gasLimit: GAS_LIMIT,
    //   })) > BigNumber.from("0")
    // ) {
    //   // TODO(nb): method for adding gas to the wallet owner
    //   logger.info("The owner wallet hasn't enough gas!");
    //   return;
    // }

    // start execution of the recursion
    await logger.info("Executing Recursion function...");
    const tx = await strategy.doRecursion({
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();

    // get and print the strategy status
    strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);

    // if the status if supply, then execute again doRecursion()
    if (strategyStatus === supply) {
      await logger.info("Executing Supply...");
      const tx = await strategy.doRecursion({
        from: wallet.address,
        gasLimit: GAS_LIMIT,
      });
      await tx.wait();
    }

    // get and print the strategy status
    strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);
  } catch (err) {
    logger.error(err);
  }
}
