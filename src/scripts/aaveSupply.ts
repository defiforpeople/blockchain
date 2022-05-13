import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool, IERC20, IERC20__factory } from "../typechain";
import { BigNumber } from "ethers";

export default async function supplyAave(
  aavePoolAddress: string,
  tokenAddress: string,
  amount: BigNumber | number
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

  console.log("Approving...");
  const gasLimit = 2074040;
  const tx = await token.approve(aavePool.address, amount, {
    from: wallet.address,
    gasLimit: gasLimit,
  });

  tx.wait();
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

// const maxDai = 1;
// const ethDaiPrice = 1900;
// const amount = ethers.utils.parseEther(`${maxDai / ethDaiPrice}`);
// const rinkebyDAI = "0x4aAded56bd7c69861E8654719195fCA9C670EB45";
const amount = 1000000;
console.log("Amount: ", amount);
const rinkebyWETH = "0xd74047010D77c5901df5b0f9ca518aED56C85e8D";
supplyAave(
  "0xE039BdF1d874d27338e09B55CB09879Dedca52D8",
  rinkebyWETH,
  amount
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
