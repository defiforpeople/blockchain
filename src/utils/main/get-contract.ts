import { Main } from "../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";

export async function getContract(
  ethers: HardhatEthersHelpers,
  address: string
): Promise<Main> {
  const mainContract = await ethers.getContractFactory("Main");
  const main = (await mainContract.attach(address)) as Main;

  return main;
}
