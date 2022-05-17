import { Main } from "../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function deployContract(
  ethers: HardhatEthersHelpers
): Promise<Main> {
  const mainContract = await ethers.getContractFactory("Main");
  const main = (await mainContract.deploy()) as Main;
  await main.deployed();

  return main;
}
