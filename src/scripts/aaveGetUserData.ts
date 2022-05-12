import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import { IPool__factory, IPool } from "../typechain";

export default async function getUserData(
  aavePoolAddress: string,
  userAddress: string,
  tokenAddress?: string
) {
  const aavePool = (await ethers.getContractAt(
    IPool__factory.abi,
    aavePoolAddress
  )) as IPool;

  // const gasLimit = 2074040;

  const userData = await aavePool.getUserAccountData(userAddress);
  console.log("userData", userData);

  const userConfig = await aavePool.getUserConfiguration(userAddress);
  console.log("userConfig", userConfig);

  const assetConfig = await aavePool.getConfiguration(userAddress);
  console.log("assetConfig", assetConfig);
}

const main = async () => {
  const wallets = await ethers.getSigners();
  const wallet = wallets[0];
  const rinkebyWBTC = "0x124F70a8a3246F177b0067F435f5691Ee4e467DD";
  getUserData(
    "0xE039BdF1d874d27338e09B55CB09879Dedca52D8",
    wallet.address,
    rinkebyWBTC
  ).catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
};
main();
