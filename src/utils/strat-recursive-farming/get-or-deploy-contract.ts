import { StrategyRecursiveFarming } from "../../../typechain";
import { HardhatEthersHelpers } from "@nomiclabs/hardhat-ethers/types";
import { utils } from "ethers";

import { deployContract } from "./deploy-contract";
import { getContract } from "./get-contract";

export async function getOrDeployContract(
  ethers: HardhatEthersHelpers,
  address?: string
): Promise<StrategyRecursiveFarming> {
  let strategy: StrategyRecursiveFarming;
  if (utils.isAddress(address!)) {
    // get strategy contract
    strategy = await getContract(ethers, address!);
    console.log("Getted strategy contract address: ", strategy.address);
  } else {
    // create strategy contract
    strategy = await deployContract(ethers);
    console.log("Created strategy contract address: ", strategy.address);
  }

  return strategy;
}
