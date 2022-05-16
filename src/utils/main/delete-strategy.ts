import { Main } from "../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function deleteStrategy(
  ethers: HardhatEthersHelpers,
  mainContractAddress: string,
  strategyAddr: string
): Promise<Main> {
  const mainContract = await ethers.getContractFactory("Main");
  const main = (await mainContract.attach(mainContractAddress)) as Main;

  const tx = await main.deleteStrategy(strategyAddr);
  await tx.wait();

  return main;
}
