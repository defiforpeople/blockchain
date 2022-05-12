import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool, IERC20__factory, IERC20 } from "../typechain";
import { BigNumber } from "ethers";

export default async function main(
  aavePoolAddress: string,
  tokenAddress: string,
  amount: BigNumber
) {
  const wallets = await ethers.getSigners();
  const wallet = wallets[0];

  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    tokenAddress
  )) as IERC20;

  const gasLimit = 2074040;

  console.log("Borrowing...");
  const supTx = await aavePool.borrow(
    token.address,
    amount,
    2, // 1: stable | 2: variable
    0,
    wallet.address,
    {
      from: wallet.address,
      gasLimit: gasLimit,
    }
  );
  console.log("Borrowed");
  console.log("TX: ", supTx);
}

const max = 0.0063795;
const amount = ethers.utils.parseEther(`${max / 2}`);
console.log("Amount: ", amount);
const rinkebyWETH = "0xd74047010D77c5901df5b0f9ca518aED56C85e8D";
// const rinkebyWBTC = "0x124F70a8a3246F177b0067F435f5691Ee4e467DD";
main("0xE039BdF1d874d27338e09B55CB09879Dedca52D8", rinkebyWETH, amount).catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
