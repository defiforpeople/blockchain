// eslint-disable-next-line camelcase
import { Greeter, IPool__factory } from "../typechain";
import { expect, use } from "chai";
import { ethers } from "hardhat";
import { deployMockContract, MockContract } from "ethereum-waffle";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, Wallet } from "ethers";
use(waffleChai);

describe("Greeter", function () {
  let ownerWallet: Wallet;
  let poolMockContract: MockContract;
  let greeterContract: Greeter;

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

    // deploy Greeter contract
    const Greeter = await await ethers.getContractFactory("Greeter");
    greeterContract = (
      await Greeter.deploy("Hello, world!", poolMockContract.address)
    ).connect(ownerWallet) as Greeter;
    await greeterContract.deployed();
  });

  it("Should return the new greeting once it's changed", async function () {
    expect(await greeterContract.greet()).to.equal("Hello, world!");

    const setGreetingTx = await greeterContract.setGreeting("Hola, mundo!");

    // wait until the transaction is mined
    await setGreetingTx.wait();

    expect(await greeterContract.greet()).to.equal("Hola, mundo!");
  });

  it("Calls user info with 'getUser' in 'TestingAaveContract' contract", async () => {
    // define mock data to use with AavePool.getUserAccountData contract method
    const mockTotalCollateralBase = BigNumber.from(6658762878);
    const mockTotalDebtBase = BigNumber.from(705414466);
    const mockAvailableBorrowsBase = BigNumber.from(4561001094);
    const mockCurrentLiquidationThreshold = BigNumber.from(8182);
    const mockLtv = BigNumber.from(7909);
    const mockHealthFactor = BigNumber.from("7723402410349775844");

    // mock AavePool getUserAccountData contract method
    // .withArgs(ethers.constants.AddressZero)
    await poolMockContract.mock.getUserAccountData.returns(
      mockTotalCollateralBase,
      mockTotalDebtBase,
      mockAvailableBorrowsBase,
      mockCurrentLiquidationThreshold,
      mockLtv,
      mockHealthFactor
    );

    // get user account data from contract using any address value
    const [
      totalCollateralBase,
      totalDebtBase,
      availableBorrowsBase,
      currentLiquidationThreshold,
      ltv,
      healthFactor,
    ] = await greeterContract.getUser(ethers.constants.AddressZero);

    // testing
    expect(totalCollateralBase).to.equal(mockTotalCollateralBase);
    expect(totalDebtBase).to.equal(mockTotalDebtBase);
    expect(availableBorrowsBase).to.equal(mockAvailableBorrowsBase);
    expect(currentLiquidationThreshold).to.equal(
      mockCurrentLiquidationThreshold
    );
    expect(ltv).to.equal(mockLtv);
    expect(healthFactor).to.equal(mockHealthFactor);
  });
});
