import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool, IERC20, IERC20__factory } from "../typechain";
import { Signer } from "ethers";

export default async function main(
  aavePoolAddress: string,
  tokenAddress: string
) {
  const wallets = await ethers.getSigners();
  const wallet = wallets[0];

  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    tokenAddress
  )) as IERC20;

  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  const amount = ethers.utils.parseEther("0.000003");
  console.log("Amount: ", amount);
  console.log("Approving...");
  const gasLimit = 2074040;
  const tx = await token.approve(aavePool.address, amount, {
    from: wallet.address,
    gasLimit: gasLimit,
  });

  await tx.wait();
  console.log(tx);
  console.log("Approved!");

  console.log("Supplying...");
  const supTx = await aavePool.supply(
    token.address,
    amount,
    wallet.address,
    0,
    {
      from: wallet.address,
      gasLimit: gasLimit,
    }
  );
  console.log("Supplied");
  console.log("TX: ", supTx);
}

const rinkebyWETH = "0xd74047010D77c5901df5b0f9ca518aED56C85e8D";
const rinkebyWBTC = "0x124F70a8a3246F177b0067F435f5691Ee4e467DD";
main("0xE039BdF1d874d27338e09B55CB09879Dedca52D8", rinkebyWBTC).catch(
  (error) => {
    console.error(error);
    process.exitCode = 1;
  }
);
