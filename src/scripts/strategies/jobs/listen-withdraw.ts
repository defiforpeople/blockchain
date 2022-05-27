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
(async () => {
  // get the wallet owner
  const [wallet] = await ethers.getSigners();

  // get strategy contract
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyContract.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

  logger.info("Listening Withdraw event");

  strategy.on("Withdraw", async (userAddr: string, amount: BigNumber) => {
    try {
      logger.info("Withdraw event listened!");
      logger.info("Executing Withdraw...");
      const withdrawTx = await strategy.withdraw(userAddr, amount, {
        from: wallet.address,
        gasLimit: GAS_LIMIT,
      });
      await withdrawTx.wait();
      logger.info("Withdraw executed");
    } catch (err) {
      logger.error(err);
    }
  });
})();
