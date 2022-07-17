import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import { SupplyAave, SupplyAave__factory } from "../../typechain";

const { SUPPLY_CONTRACT_ADDRESS } = process.env;

export async function withdraw(
  lpAmount: BigNumber,
  tokenAddr: string,
  senderAddr: string
) {
  const supplyContract = (await ethers.getContractAt(
    SupplyAave__factory.abi,
    `${SUPPLY_CONTRACT_ADDRESS}`
  )) as SupplyAave;

  const withdrawTx = await supplyContract.withdraw(lpAmount, tokenAddr, {
    from: senderAddr,
  });
  await withdrawTx.wait();
}
