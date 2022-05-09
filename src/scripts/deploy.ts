import { ethers } from "hardhat";

async function main() {
  const TestingAavePool = await ethers.getContractFactory("TestingAavePool");
  const aaveContract = await TestingAavePool.deploy(
    "0xE039BdF1d874d27338e09B55CB09879Dedca52D8"
  );

  await aaveContract.deployed();

  console.log("aaveContract deployed to:", aaveContract.address);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
