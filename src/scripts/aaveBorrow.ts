import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool } from "../typechain";

export default async function main(
  aavePoolAddress: string,
  tokenAddress: string
) {
  const wallets = await ethers.getSigners();
  const wallet = wallets[0];

  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  const max = 0.0113252;
  console.log("max", ethers.utils.parseEther(`${max}`));
  const amount = ethers.utils.parseEther(`${max / 2}`);
  console.log("Amount: ", amount);
  const gasLimit = 2074040;

  console.log("Borrowing...");
  const supTx = await aavePool.borrow(
    tokenAddress,
    amount,
    1, // 1: variable | 2: stable
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

const rinkebyWETH = "0xd74047010D77c5901df5b0f9ca518aED56C85e8D";
// const rinkebyWBTC = "0x124F70a8a3246F177b0067F435f5691Ee4e467DD";
main("0xE039BdF1d874d27338e09B55CB09879Dedca52D8", rinkebyWETH).catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
