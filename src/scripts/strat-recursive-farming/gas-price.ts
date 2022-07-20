import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
// eslint-disable-next-line camelcase
import { StrategyRecursiveFarming } from "../../typechain";

// defined constants
const { CONTRACT_ADDRESS } = process.env;

// method for watching gas price from chainlink data feed
export async function getGasPrice(): Promise<BigNumber> {
  // get strategy contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  try {
    // execute method that returns gas price from the strategy contract
    const gasPrice = await strategy.gasPrice();

    // return it
    return BigNumber.from(gasPrice);
  } catch (err) {
    console.error(err);
  }
}
