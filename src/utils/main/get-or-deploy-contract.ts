import { Main } from "../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { utils } from "ethers";

import { deployContract } from "./deploy-contract";
import { getContract } from "./get-contract";

export async function getOrDeployContract(
  ethers: HardhatEthersHelpers,
  address?: string
): Promise<Main> {
  let main: Main;
  if (utils.isAddress(address!)) {
    // get main contract
    main = await getContract(ethers, address!);
    console.log("Getted main contract address: ", main.address);
  } else {
    // create main contract
    main = await deployContract(ethers);
    console.log("Created main contract address: ", main.address);
  }

  return main;
}
