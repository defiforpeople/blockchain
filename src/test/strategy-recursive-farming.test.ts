// eslint-disable-next-line camelcase
import {
  StrategyRecursiveFarming,
  // eslint-disable-next-line camelcase
  IPool__factory,
  // eslint-disable-next-line camelcase
  IWETH__factory,
  IWETH,
  IERC20,
  // eslint-disable-next-line camelcase
  StrategyRecursiveFarming__factory,
  // eslint-disable-next-line camelcase
  IERC20__factory,
} from "../typechain";
import { assert, expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { deployMockContract, MockContract } from "ethereum-waffle";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, logger, Signer } from "ethers";
use(waffleChai);

describe("StrategyRecursiveFarming", () => {
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let ownerAddress: string;

  let poolMockContract: MockContract;
  let tokenMockContract: MockContract;
  let strategyContract: StrategyRecursiveFarming;
  let wethToken: IWETH;
  let keeperInterval: BigNumber;
  let maxSupply: BigNumber;

  enum StrategyStatus {
    Pristine,
    Borrow,
    Supply,
    Done,
  }

  beforeEach(async () => {
    // prepare (signers) ownerWallet and userWallet
    // send 1 eth from signer(0) to random ownerWallet and userWallet
    owner = ethers.provider.getSigner(0);
    ownerAddress = await owner.getAddress();

    user = ethers.provider.getSigner(2);
    userAddress = await user.getAddress();

    await owner.sendTransaction({
      to: ownerAddress,
      value: ethers.utils.parseEther("1.0"),
    });
    await owner.sendTransaction({
      to: userAddress,
      value: ethers.utils.parseEther("1.0"),
    });

    // define AavePool mock contract
    poolMockContract = await deployMockContract(owner, IPool__factory.abi);

    // define tokn mock contract
    const WRAPPED_NATIVE_TOKEN_ADDRESS =
      "0xd74047010D77c5901df5b0f9ca518aED56C85e8D"; // WETH address in rinkeb
    tokenMockContract = await deployMockContract(owner, IERC20__factory.abi);
    // tokenMockContract.mock.address.returns(WRAPPED_NATIVE_TOKEN_ADDRESS);

    // mock maxSupply for token
    maxSupply = BigNumber.from("13798999");
    tokenMockContract.mock.totalSupply.returns(maxSupply);

    // define other constants that the constructor requires for deploy
    keeperInterval = BigNumber.from(300); // define interval for keeper to execute
    const GAS_DATA_FEED = ethers.constants.AddressZero;
    const REWARDS_EMISSION_MANAGER = ethers.constants.AddressZero;

    // deploy StrategyRecursiveFarming contract
    const strategyRecursiveFarming = (await ethers.getContractFactory(
      "StrategyRecursiveFarming"
      // eslint-disable-next-line camelcase
    )) as StrategyRecursiveFarming__factory;

    strategyContract = await strategyRecursiveFarming.deploy(
      poolMockContract.address,
      `${GAS_DATA_FEED}`,
      tokenMockContract.address,
      `${REWARDS_EMISSION_MANAGER}`,
      keeperInterval
    );
    await strategyContract.deployed();

    // define the wrapped native token (WAVAX or WETH)
    wethToken = (await ethers.getContractAt(
      IWETH__factory.abi,
      `${WRAPPED_NATIVE_TOKEN_ADDRESS}`,
      user
    )) as IWETH;

    // get wrapped native token to owner and user wallets
    await wethToken.deposit({
      from: userAddress,
      value: ethers.utils.parseEther("1.0"),
    });

    await wethToken.transfer(ownerAddress, ethers.utils.parseEther("0.5"), {
      from: userAddress,
    });

    // fails, missing mocks of gas oracles and aave
    // await strategyContract.deposit(ethers.utils.parseEther("0.1"), {
    //   from: ownerAddress,
    // });

    // const userBalance = await wethToken.balanceOf(userAddress);
    // logger.info(userBalance);
  });

  describe("constructor", () => {
    it("Initializes the strategy correctly", async () => {
      const status = await strategyContract.getStatus();
      const interval = await strategyContract.getInterval();
      const lastTimestamp = await strategyContract.getLastTimestamp();
      const maxSupply = await strategyContract.getMaxSupply();

      logger.info("Max Supply: ", maxSupply.toNumber());
      logger.info("Last Timestamp: ", lastTimestamp.toNumber());

      expect(status).to.equal(StrategyStatus.Pristine);
      expect(interval).to.equal(keeperInterval);
      expect(maxSupply).to.equal(maxSupply);
      assert(lastTimestamp > BigNumber.from(0));
    });
  });

  // it("tests deposit()", async () => {
  //   const amount = ethers.utils.parseEther("0.3");
  //   await poolMockContract.mock.supply.returns(
  //     token.transferFrom(userWallet.address, poolMockContract.address, amount)
  //   );
  // });
});
