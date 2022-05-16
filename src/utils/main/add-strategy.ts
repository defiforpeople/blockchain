import { Main } from "../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function addStrategy(
  ethers: HardhatEthersHelpers,
  mainContractAddress: string,
  strategyAddr: string,
  strategyName: string
): Promise<Main> {
  const mainContract = await ethers.getContractFactory("Main");
  const main = (await mainContract.attach(mainContractAddress)) as Main;

  const tx = await main.addStrategy(strategyAddr, strategyName);
  await tx.wait();

  return main;
}
