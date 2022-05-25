import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { BigNumber } from "ethers";
// eslint-disable-next-line camelcase
import { IWETH, IWETH__factory } from "../../typechain";
export async function getWeth(sender: string, amount: BigNumber) {
  const { WRAPPED_NATIVE_TOKEN_ADDRESS } = process.env;
  const GAS_LIMIT = 2074040;
  // define instance of erc20 token
  const token = (await ethers.getContractAt(
    IWETH__factory.abi,
    `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
  )) as IWETH;

  const tx = await token.deposit({
    from: sender,
    value: amount,
    gasLimit: GAS_LIMIT,
  });
  await tx.wait();
}
