import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
import { sleep, minute } from "../../../utils/helpers/sleep";
// eslint-disable-next-line camelcase
import { StrategyRecursiveFarming } from "../../../typechain";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// define constants for possible smart contract status
export enum Status {
  Borrow,
  Supply,
  Done,
}

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
    // print the strategy status
    let strategyStatus = await strategy.viewStatus();
    logger.info(`The status of the strategy is ${strategyStatus}`);

    // if the status is done, recursion is not necessary
    if (strategyStatus === Status.Done) {
      logger.info("The strategy is in DONE status");
      return;
    }

    // start execution of the recursion
    logger.info("Executing Recursion function...");
    const tx = await strategy.doRecursion({
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();
    logger.info("Recursion function Executed");

    // get and the strategy status
    strategyStatus = await strategy.viewStatus();

    // if the status if supply, then execute again doRecursion()
    if (strategyStatus === Status.Supply) {
      logger.info(
        `The status of the strategy is (1 = SUPPLY) ${strategyStatus}`
      );
      logger.info("Executing Supply...");
      const tx = await strategy.doRecursion({
        from: wallet.address,
        gasLimit: GAS_LIMIT,
      });
      await tx.wait();
      logger.info("Supply executed");

      // get the strategy status
      strategyStatus = await strategy.viewStatus();
    }

    logger.info(`The status of the strategy is (2 = DONE) ${strategyStatus}`);
  } catch (err) {
    logger.error(err);
  }
}
