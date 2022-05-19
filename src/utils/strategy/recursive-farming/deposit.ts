import { StrategyRecursiveFarming } from "../../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumber } from "ethers";

export async function deposit(
  ethers: HardhatEthersHelpers,
  strategyAddress: string,
  tokenAddr: string,
  amount: BigNumber
): Promise<void> {
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyContract.attach(
    strategyAddress
  )) as StrategyRecursiveFarming;

  const tx = await strategy.deposit(tokenAddr, amount);
  await tx.wait();
}
