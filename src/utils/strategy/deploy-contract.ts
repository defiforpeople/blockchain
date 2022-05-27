import { Strategy } from "../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function deployContract(
  ethers: HardhatEthersHelpers
): Promise<Strategy> {
  const strategyContract = await ethers.getContractFactory("Strategy");
  const startegy = (await strategyContract.deploy()) as Strategy;
  await startegy.deployed();

  return startegy;
}
