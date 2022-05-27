// eslint-disable-next-line camelcase
import {
  StrategyRecursiveFarming,
  // eslint-disable-next-line camelcase
  IPool__factory,
  // eslint-disable-next-line camelcase
  IWETH__factory,
  IWETH,
} from "../typechain";
import { expect, use } from "chai";
import { ethers } from "hardhat";
import { deployMockContract, MockContract } from "ethereum-waffle";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, Wallet } from "ethers";
use(waffleChai);

describe("StrategyRecursiveFarming", function () {
  let ownerWallet: Wallet;
  let userWallet: Wallet;
  let poolMockContract: MockContract;
  let strategyContract: StrategyRecursiveFarming;
  let token: IWETH;

  beforeEach(async () => {
    // prepare randoms ownerWallet and userWallet
    ownerWallet = ethers.Wallet.createRandom().connect(ethers.provider);
    userWallet = ethers.Wallet.createRandom().connect(ethers.provider);

    // send 1 eth from signer(0) to random ownerWallet and userWallet
    const signer = ethers.provider.getSigner(0);
    await signer.sendTransaction({
      to: ownerWallet.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await signer.sendTransaction({
      to: userWallet.address,
      value: ethers.utils.parseEther("1.0"),
    });

    // define AavePool mock contract
    poolMockContract = await deployMockContract(signer, IPool__factory.abi);

    // define other constants that the constructor requires for deploy
    const KEEPER_INTERVAL = 300; // define interval for keeper to execute
    const GAS_DATA_FEED = ethers.constants.AddressZero;
    // TODO(nb): don't know if this will work
    const WRAPPED_NATIVE_TOKEN_ADDRESS =
      "0xd74047010D77c5901df5b0f9ca518aED56C85e8D"; // WETH address in rinkeby
    const REWARDS_EMISSION_MANAGER = ethers.constants.AddressZero;

    // deploy StrategyRecursiveFarming contract
    const strategyRecursiveFarming = await ethers.getContractFactory(
      "StrategyRecursiveFarming"
    );
    strategyContract = (
      await strategyRecursiveFarming.deploy(
        poolMockContract.address,
        GAS_DATA_FEED,
        WRAPPED_NATIVE_TOKEN_ADDRESS,
        REWARDS_EMISSION_MANAGER,
        KEEPER_INTERVAL
      )
    ).connect(ownerWallet) as StrategyRecursiveFarming;
    await strategyContract.deployed();

    // define the wrapped native token (WAVAX or WETH)
    token = (await ethers.getContractAt(
      IWETH__factory.abi,
      `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
    )) as IWETH;

    // get wrapped native token to owner and user wallets
    await token.deposit({
      from: userWallet.address,
      value: ethers.utils.parseEther("0.5"),
    });
    await token.deposit({
      from: ownerWallet.address,
      value: ethers.utils.parseEther("0.5"),
    });
  });

  it("tests deposit()", async () => {
    const amount = ethers.utils.parseEther("0.3");
    await poolMockContract.mock.supply.returns(
      token.transferFrom(userWallet.address, poolMockContract.address, amount)
    );
  });
});
