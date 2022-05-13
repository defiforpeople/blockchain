import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool, IERC20, IERC20__factory } from "../typechain";
import { BigNumber } from "ethers";
import { parseEther } from "ethers/lib/utils";

const { WETH_ADDRESS, AAVE_POOL_ADDRESS } = process.env;
if (!WETH_ADDRESS || !AAVE_POOL_ADDRESS) {
  throw new Error("invalid ENV values");
}

const GAS_LIMIT = 2074040;
const max = 0.0064423;
const AMOUNT = parseEther(`${max / 2}`);

export default async function supplyAave(
  aavePoolAddress: string,
  tokenAddress: string,
  amount: BigNumber
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
      gasLimit: GAS_LIMIT,
    }
  );
  await supTx.wait();
  console.log("Supplied");
  console.log("TX: ", supTx);
}

// TODO(nb): Get EthDai price from Chainlink
// const maxDai = 1;
// const ethDaiPrice = 1900;
// const amount = ethers.utils.parseEther(`${maxDai / ethDaiPrice}`);
// const rinkebyDAI = "0x4aAded56bd7c69861E8654719195fCA9C670EB45";

supplyAave(AAVE_POOL_ADDRESS, WETH_ADDRESS, AMOUNT).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
