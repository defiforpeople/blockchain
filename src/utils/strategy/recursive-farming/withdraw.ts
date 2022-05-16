import { StrategyRecursiveFarming } from "../../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { BigNumber } from "ethers";

export async function withdraw(
  ethers: HardhatEthersHelpers,
  strategyAddress: string,
  userAddr: string,
  tokenAddr: string,
  cuotas: BigNumber
): Promise<void> {
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyContract.attach(
    strategyAddress
  )) as StrategyRecursiveFarming;

  const tx = await strategy.withdraw(userAddr, tokenAddr, cuotas);
  await tx.wait();
}
