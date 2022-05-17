import {
  // eslint-disable-next-line camelcase
  IPool__factory,
  FlashloanFarming,
  // eslint-disable-next-line camelcase
  FlashLoanSimpleReceiverBase__factory,
} from "../typechain";
import { expect, use } from "chai";
import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { deployMockContract, MockContract } from "ethereum-waffle";
import { waffleChai } from "@ethereum-waffle/chai";
import { Wallet } from "ethers";
use(waffleChai);

describe("FlashloanFarming", function () {
  let ownerWallet: Wallet;
  let poolMockContract: MockContract;
  let FlashloanFarmingContract: FlashloanFarming;
  let flashLoanSimpleReceiverBaseContract: MockContract;

  beforeEach(async () => {
    // prepare randoms ownerWallet
    ownerWallet = ethers.Wallet.createRandom().connect(ethers.provider);

    // send 1 eth from signer(0) to random ownerWallet
    const signer = ethers.provider.getSigner(0);
    await signer.sendTransaction({
      to: ownerWallet.address,
      value: ethers.utils.parseEther("1.0"),
    });

    // define AavePool mock contract
    poolMockContract = await deployMockContract(
      ownerWallet,
      IPool__factory.abi
    );
    await poolMockContract.deployed();

    flashLoanSimpleReceiverBaseContract = await deployMockContract(
      ownerWallet,
      FlashLoanSimpleReceiverBase__factory.abi
    );
    await flashLoanSimpleReceiverBaseContract.deployed();

    // deploy Greeter contract
    const FlashloanFarming = await ethers.getContractFactory(
      "FlashloanFarming"
    );
    FlashloanFarmingContract = (
      await FlashloanFarming.deploy(poolMockContract.address)
    ).connect(ownerWallet) as FlashloanFarming;
    await FlashloanFarmingContract.deployed();
  });

  it("Check the balance of interacting with 'flashloan' function of 'FlashloanFarming' contract before, after and at the moment of executing the flashloan", async () => {
    const amount = ethers.utils.parseEther("0.5");
    const tokenAddress = ethers.constants.AddressZero;
    await poolMockContract.mock.flashLoanSimple
      // .withArgs(ownerWallet, tokenAddress, amount, "", 0)
      .returns(amount);

    const balance = await FlashloanFarmingContract.flashloan(
      tokenAddress,
      amount
    );

    expect(balance).to.equal(balance);
  });
});
