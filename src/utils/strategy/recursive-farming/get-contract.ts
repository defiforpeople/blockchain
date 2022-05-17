import { StrategyRecursiveFarming } from "../../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function getContract(
  ethers: HardhatEthersHelpers,
  address: string
): Promise<StrategyRecursiveFarming> {
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyContract.attach(
    address
  )) as StrategyRecursiveFarming;

  return strategy;
}
