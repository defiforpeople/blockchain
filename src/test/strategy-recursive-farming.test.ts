// eslint-disable-next-line camelcase
import {
  StrategyRecursiveFarming,
  // eslint-disable-next-line camelcase
  StrategyRecursiveFarming__factory,
  MockV3Aggregator,
  MockIncentivesController,
  DFP,
  MockPoolDFP,
} from "../typechain";
import { assert, expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, logger, Signer } from "ethers";
use(waffleChai);

describe("StrategyRecursiveFarming", () => {
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let ownerAddress: string;

  let strategyContract: StrategyRecursiveFarming;
  let keeperInterval: BigNumber;
  let maxSupply: BigNumber;
  let token: DFP;
  let mockV3Aggregator: MockV3Aggregator;
  let mockIncentivesCont: MockIncentivesController;
  let gasPrice: BigNumber;
  let poolMock: MockPoolDFP;

  let userBalance: BigNumber;
  let ownerBalance: BigNumber;
  let poolBalance: BigNumber;

  enum StrategyStatus {
    Pristine,
    Borrow,
    Supply,
    Done,
  }

  beforeEach(async () => {
    // prepare (signers) ownerWallet and userWallet
    owner = ethers.provider.getSigner(0);
    ownerAddress = await owner.getAddress();

    user = ethers.provider.getSigner(2);
    userAddress = await user.getAddress();

    // send 1 eth from signer(0) to random ownerWallet and userWallet
    await owner.sendTransaction({
      to: ownerAddress,
      value: ethers.utils.parseEther("1.0"),
    });
    await owner.sendTransaction({
      to: userAddress,
      value: ethers.utils.parseEther("1.0"),
    });

    // get gas price and set decimals, for MOCKVAgg contract, and for testing purpose
    gasPrice = await ethers.provider.getGasPrice();
    const decimals = BigNumber.from(18);

    // get and deploy MockV3Aggregator contract (returns gas price)
    const mockAggFactory = await ethers.getContractFactory("MockV3Aggregator");
    mockV3Aggregator = (await mockAggFactory.deploy(
      decimals,
      gasPrice
    )) as MockV3Aggregator;

    // get and deploy MockIncentivesController contract (for claiming funcitons)
    const mockIncentivesFactory = await ethers.getContractFactory(
      "MockIncentivesController"
    );
    mockIncentivesCont =
      (await mockIncentivesFactory.deploy()) as MockIncentivesController;

    // // define AavePool mock contract
    const poolFactory = await ethers.getContractFactory("MockPoolDFP");
    poolMock = (await poolFactory.deploy()) as MockPoolDFP;

    // define token mock contract (DFP token our own token for testing)
    const dfpTokenFactory = await ethers.getContractFactory("DFP");
    token = (await dfpTokenFactory.deploy()) as DFP;

    // get wrapped native token to owner and user wallets
    await token.mint(ownerAddress, ethers.utils.parseEther("1.0"));
    await token.mint(userAddress, ethers.utils.parseEther("1.0"));
    await token.mint(poolMock.address, ethers.utils.parseEther("10.0"));

    // define keeperInterval for deploying the strategy contract
    keeperInterval = BigNumber.from(300); // define interval for keeper to execute

    // get and deploy StrategyRecursiveFarming contract
    const strategyRecursiveFarming = (await ethers.getContractFactory(
      "StrategyRecursiveFarming"
      // eslint-disable-next-line camelcase
    )) as StrategyRecursiveFarming__factory;

    strategyContract = await strategyRecursiveFarming.deploy(
      poolMock.address,
      mockV3Aggregator.address,
      token.address,
      mockIncentivesCont.address,
      keeperInterval
    );
    await strategyContract.deployed();

    // get balances
    userBalance = await token.balanceOf(userAddress);
    ownerBalance = await token.balanceOf(ownerAddress);
    poolBalance = await token.balanceOf(poolMock.address);

    // get max supply
    maxSupply = await token.totalSupply();
  });

  describe("constructor", () => {
    it("Initializes the strategy correctly", async () => {
      const status = await strategyContract.getStatus();
      const interval = await strategyContract.getInterval();
      const lastTimestamp = await strategyContract.getLastTimestamp();
      const maxSupplyContract = await strategyContract.getMaxSupply();

      expect(status).to.equal(StrategyStatus.Pristine);
      expect(interval).to.equal(keeperInterval);
      assert(lastTimestamp > BigNumber.from(0));
      expect(maxSupplyContract.toString()).to.equal(maxSupply.toString());
    });
  });

  describe("deposit", () => {
    it("tests revert with enough balance error", async () => {
      const amount = ethers.utils.parseEther("111");
      await expect(
        strategyContract.deposit(amount, { from: ownerAddress })
      ).to.be.revertedWith("Error__NotEnoughBalance()");
    });

    it("tests deposit makes 'transferFrom' successfully", async () => {
      const amount = ethers.utils.parseEther("0.1");
      const firstBalance = await token.balanceOf(ownerAddress);

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      const secondBalance = await token.balanceOf(ownerAddress);

      expect(firstBalance.sub(amount)).to.equal(secondBalance);
    });
  });
});
