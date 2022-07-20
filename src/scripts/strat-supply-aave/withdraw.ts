import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SupplyAave, SupplyAave__factory } from "../../typechain";

const { SUPPLY_CONTRACT_ADDRESS } = process.env;
if (!SUPPLY_CONTRACT_ADDRESS || SUPPLY_CONTRACT_ADDRESS === "") {
  throw new Error("invalid ENV values");
}

export async function withdraw(
  lpAmount: BigNumber,
  tokenAddr: string,
  userAddr: string
) {
  const supplyContract = (await ethers.getContractAt(
    SupplyAave__factory.abi,
    SUPPLY_CONTRACT_ADDRESS!
  )) as SupplyAave;

  const withdrawTx = await supplyContract.withdraw(lpAmount, tokenAddr, {
    from: userAddr,
  });
  await withdrawTx.wait();
}
