import { StrategyRecursiveFarming } from "../../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function deployContract(
  ethers: HardhatEthersHelpers
): Promise<StrategyRecursiveFarming> {
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy =
    (await strategyContract.deploy()) as StrategyRecursiveFarming;
  await strategy.deployed();

  return strategy;
}
