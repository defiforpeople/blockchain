import { ethers } from "hardhat";

export default async function main(
  aavePoolAddress: string,
  userAddress: string
) {
  const TestingAavePool = await ethers.getContractFactory("TestingAavePool");
  const aaveContract = await TestingAavePool.deploy(aavePoolAddress);

  await aaveContract.deployed();

  console.log("Address: ", aaveContract.address);

  const userInfo = await aaveContract.getUser(userAddress);

  console.log("User info on aaveContract:", userInfo);
}

main(
  "0xE039BdF1d874d27338e09B55CB09879Dedca52D8",
  "0x57ac4E23aE911Cb3aEDAfE9ABb8E68a68F7CC463"
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
