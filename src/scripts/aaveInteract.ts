import { ethers } from "hardhat";

async function main() {
  const TestingAavePool = await ethers.getContractFactory("TestingAavePool");
  const aaveContract = await TestingAavePool.deploy(
    "0xE039BdF1d874d27338e09B55CB09879Dedca52D8"
  );

  await aaveContract.deployed();

  console.log("Address: ", aaveContract.address);

  const userInfo = await aaveContract.getUser(
    "0x57ac4E23aE911Cb3aEDAfE9ABb8E68a68F7CC463"
  );

  console.log("User info on aaveContract:", userInfo);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
