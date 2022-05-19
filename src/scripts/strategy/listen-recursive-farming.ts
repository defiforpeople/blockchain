import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
import { StrategyRecursiveFarming } from "../../typechain";
const logger = require("pino")();

const GAS_LIMIT = 2074040;

export async function listen(strategyAddress: string) {
  let continueLoop: boolean;
  let tokenAddress: string;

  const [wallet] = await ethers.getSigners();

  const strategyContract = ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyContract).attach(
    strategyAddress
  ) as StrategyRecursiveFarming;

  strategy.on(
    "Deposit",
    async (userAddr: string, tokenAddr: string, amount: BigNumber, ev: any) => {
      tokenAddress = tokenAddr;
      const borrowTx = await strategy.borrow(userAddr, tokenAddr, amount, {
        from: `${wallet.address}`,
        gasLimit: GAS_LIMIT,
      });
      borrowTx.wait();
    }
  );

  strategy.on(
    "Borrow",
    async (
      userAddr: string,
      amount: BigNumber,
      continues: boolean,
      ev: any
    ) => {
      continueLoop = continues;
      strategy.supply(tokenAddress, amount, {
        from: `${wallet.address}`,
        gasLimit: GAS_LIMIT,
      });
      if (!continueLoop) {
        process.exitCode(1);
      }
    }
  );

  strategy.on(
    "Supply",
    async (userAddr: string, amount: BigNumber, ev: any) => {
      strategy.borrow(userAddr, tokenAddress, amount);
    }
  );
}
