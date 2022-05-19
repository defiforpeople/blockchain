import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
import { StrategyRecursiveFarming } from "../../typechain";
const logger = require("pino")();

const GAS_LIMIT = 2074040;
export async function listen(strategyAddress: string): Promise<void> {
  const strategyContract = ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyContract).attach(
    strategyAddress
  ) as StrategyRecursiveFarming;

  strategy.on(
    "Deposit",
    async (
      userAddr: string,
      tokenAddr: string,
      amount: BigNumber,
      quotas: BigNumber,
      ev: any
    ) => {
      try {
        const borrowTx = await strategy.borrow(userAddr, tokenAddr, amount, {
          from: strategy.address,
          gasLimit: GAS_LIMIT,
        });
        await borrowTx.wait();
      } catch (err) {
        logger.error(err);
      }
    }
  );

  strategy.on(
    "Borrow",
    async (
      userAddr: string,
      tokenAddr: string,
      amount: BigNumber,
      ev: any
    ): Promise<void> => {
      try {
        const supplyTx = await strategy.supply(userAddr, tokenAddr, amount, {
          from: strategy.address,
          gasLimit: GAS_LIMIT,
        });
        await supplyTx.wait();
      } catch (err) {
        logger.error(err);
      }
    }
  );

  strategy.on(
    "Supply",
    async (
      userAddr: string,
      tokenAddr: string,
      amount: BigNumber,
      continues: boolean,
      ev: any
    ): Promise<void> => {
      try {
        if (!continues) {
          return;
        }
        const borrowTx = await strategy.borrow(userAddr, tokenAddr, amount);
        await borrowTx.wait();
      } catch (err) {
        logger.error(err);
      }
    }
  );
}
