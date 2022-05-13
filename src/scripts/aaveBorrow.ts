import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool, IERC20__factory, IERC20 } from "../typechain";
import { BigNumber } from "ethers";

const { WETH_ADDRESS, AAVE_POOL_ADDRESS } = process.env;
if (!WETH_ADDRESS || !AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

const GAS_LIMIT = 2074040;

export default async function borrowAave(
  aavePoolAddress: string,
  tokenAddress: string,
  amount: BigNumber
) {
  const [wallet] = await ethers.getSigners();

  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    tokenAddress
  )) as IERC20;

  console.log("Borrowing...");
  const supTx = await aavePool.borrow(
    token.address,
    amount,
    2, // 1: stable | 2: variable
    0,
    wallet.address,
    {
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    }
  );
  console.log("Borrowed");
  console.log("TX: ", supTx);

  await supTx.wait();
}

// TODO(nb): Should get the max amount to borrow in GetUserData
const max = 0.0000628;
const amount = ethers.utils.parseEther(`${max / 2}`);
console.log("Amount: ", amount);
borrowAave(AAVE_POOL_ADDRESS, WETH_ADDRESS, amount).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
