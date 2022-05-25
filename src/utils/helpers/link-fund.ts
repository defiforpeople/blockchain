import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import {
  LinkTokenInterface,
  // eslint-disable-next-line camelcase
  LinkTokenInterface__factory,
} from "../../typechain";

export async function linkFund(sender: string, amount: BigNumber) {
  const { LINK_ADDRESS, CONTRACT_ADDRESS } = process.env;
  const GAS_LIMIT = 2074040;
  // define instance of erc20 token
  const linkToken = (await ethers.getContractAt(
    LinkTokenInterface__factory.abi,
    `${LINK_ADDRESS}`
  )) as LinkTokenInterface;

  const tx = await linkToken.transfer(`${CONTRACT_ADDRESS}`, amount, {
    from: sender,
    gasLimit: GAS_LIMIT,
  });
  await tx.wait();
}
