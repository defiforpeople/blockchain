import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  IERC20__factory,
  IERC20,
  SupplyAave,
  SupplyAave__factory,
} from "../../typechain";

const { SUPPLY_CONTRACT_ADDRESS } = process.env;

export async function deposit(
  amount: BigNumber,
  senderAddr: string,
  tokenAddr: string,
  aavePoolAddr: string
) {
  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    `${tokenAddr}`
  )) as IERC20;

  const supplyContract = (await ethers.getContractAt(
    SupplyAave__factory.abi,
    `${SUPPLY_CONTRACT_ADDRESS}`
  )) as SupplyAave;

  const approveTx = await token.approve(`${aavePoolAddr}`, amount, {
    from: senderAddr,
  });
  await approveTx.wait();

  // signatures
  const permitV = BigNumber.from(`${approveTx.v}`);
  const permitR = `${approveTx.r}`;
  const permitS = `${approveTx.s}`;

  const oneHour = BigNumber.from(`${60 * 60}`); // 1 hour
  // 1 hour from the tx timestamp
  const deadline = BigNumber.from(`${approveTx.timestamp}`).add(oneHour);

  const supplyTx = await supplyContract.deposit(
    amount,
    tokenAddr,
    deadline,
    permitV,
    permitR,
    permitS,
    {
      from: senderAddr,
    }
  );
  await supplyTx.wait();
}
