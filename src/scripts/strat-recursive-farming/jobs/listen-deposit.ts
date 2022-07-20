import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { StrategyRecursiveFarming } from "../../../typechain";
import { doRecursion } from "../recursive-farming/do-recursion";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS } = process.env;

// function for user to deposit in the smart contract and start strategy
(async () => {
  // get the strategy contract
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyContract.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

  logger.info("Listening!");

  strategy.on("Deposit", async () => {
    try {
      logger.info("Deposit event listened");
      await doRecursion();
    } catch (err) {
      console.error(err);
    }
  });
})();
