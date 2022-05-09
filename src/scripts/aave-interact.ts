import { ethers } from "hardhat";

const userInfo = async () => {
  const TestingAavePool = await ethers.getContractFactory("TestingAavePool");
  const testingAavePool = TestingAavePool.attach(
    "0xb955e9D595d34ED2FefE306ddcec33F5B574CaA5" // The deployed contract address
  );

  // Now you can call functions of the contract
  const infoUser = await testingAavePool.getUser(
    "0x57ac4E23aE911Cb3aEDAfE9ABb8E68a68F7CC463"
  );

  console.log(infoUser);
};

userInfo();
