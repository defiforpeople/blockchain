import {
  StrategyRecursiveFarming,
  StrategyRecursiveFarming__factory,
  MockV3Aggregator,
  DFP,
  MockPoolDFP,
  IRewardsController__factory,
} from "../../../typechain";
import { expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import {
  deployMockContract,
  MockContract,
} from "@ethereum-waffle/mock-contract";
import { BigNumber, Signer } from "ethers";
const logger = require("pino")();
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
  let mockIncentivesCont: MockContract;
  let gasPrice: BigNumber;
  let poolMock: MockPoolDFP;
  let gasPriceMultiplier: BigNumber;
  let aaveRefCode: BigNumber;

  enum StrategyStatus {
    Pristine,
    Borrow,
    Supply,
    Done,
  }

  beforeEach(async () => {
    // prepare (signers) ownerWallet and userWallet (10 ETH each)
    [owner, user] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    userAddress = await user.getAddress();

    // get gas price and set decimals, for MOCKVAgg contract, and for testing purpose
    gasPrice = await ethers.provider.getGasPrice();
    const decimals = BigNumber.from("18");

    // get and deploy MockV3Aggregator contract (returns gas price)
    const mockAggFactory = await ethers.getContractFactory("MockV3Aggregator");
    mockV3Aggregator = (await mockAggFactory.deploy(
      decimals,
      gasPrice
    )) as MockV3Aggregator;

    // get and deploy MockIncentivesController contract (for claiming funcitons)
    mockIncentivesCont = await deployMockContract(
      owner,
      IRewardsController__factory.abi
    );

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

    // get and deploy StrategyRecursiveFarming contract
    const strategyRecursiveFarming = (await ethers.getContractFactory(
      "StrategyRecursiveFarming"
    )) as StrategyRecursiveFarming__factory;

    keeperInterval = BigNumber.from(300); // define interval for keeper to execute
    gasPriceMultiplier = BigNumber.from(1); // define gas price multiplier for testing

    // deploy strategy contract
    strategyContract = await strategyRecursiveFarming.deploy(
      poolMock.address,
      mockV3Aggregator.address,
      token.address,
      mockIncentivesCont.address,
      keeperInterval,
      gasPriceMultiplier
    );
    await strategyContract.deployed();

    // get max supply
    maxSupply = await token.totalSupply();
    aaveRefCode = await strategyContract.getAaveRefCode();
  });

  describe("constructor", () => {
    it("Initializes the strategy correctly", async () => {
      const status = await strategyContract.getStatus();
      const interval = await strategyContract.getInterval();
      const maxSupplyContract = await strategyContract.getTotalSupply();
      const gasPriceMultiplierContract =
        await strategyContract.getGasPriceMultiplier();
      const tokenAddresses = await strategyContract.getTokenAddresses();
      logger.info(tokenAddresses);

      const lastTimestamp = await strategyContract.getLastTimestamp({
        from: ownerAddress,
      });
      const aaveRefCodeContract = await strategyContract.getAaveRefCode();

      expect(status).eq(StrategyStatus.Pristine);
      expect(interval).eq(keeperInterval);
      expect(maxSupplyContract.toString()).eq(maxSupply.toString());
      expect(gasPriceMultiplierContract).eq(gasPriceMultiplier);
      expect(tokenAddresses.toString()).eq([token.address].toString());
      expect(aaveRefCodeContract).eq(aaveRefCode);
      expect(lastTimestamp).to.be.gt(BigNumber.from(0));
    });
  });

  describe("deposit", () => {
    it("tests revert with enough balance error", async () => {
      const amount = ethers.utils.parseEther("111");
      const balance = await token.balanceOf(ownerAddress);

      await expect(
        strategyContract.deposit(amount, { from: ownerAddress })
      ).to.be.revertedWith(`Error__NotEnoughBalance(${balance})`);
    });

    it("makes 'transferFrom' successfully", async () => {
      const amount = ethers.utils.parseEther("0.1");
      const firstBalance = await token.balanceOf(ownerAddress);

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      const secondBalance = await token.balanceOf(ownerAddress);

      logger.info(`firstBalance: ${firstBalance.toString()}`);
      logger.info(`secondBalance: ${secondBalance.toString()}`);
      expect(firstBalance.sub(amount)).to.equal(secondBalance);
    });

    it("updates contract status and total invested correctly, and quotas", async () => {
      const amount = ethers.utils.parseEther("0.1");

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      const status = await strategyContract.getStatus();
      const totalInvested = await strategyContract.getTotalInvested();
      const quota = await strategyContract.getQuotasPerAddress(ownerAddress);

      expect(status).to.equal(StrategyStatus.Borrow);
      expect(totalInvested.toString()).to.equal(amount.toString());
      // Only test if updates quotas here. Then will be tested if it is correct in future quota's functions tests
      expect(quota).to.be.gt(BigNumber.from(0));
    });
    it("emits correctly Deposit event", async () => {
      const amount = ethers.utils.parseEther("0.1");

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });

      await expect(
        strategyContract.deposit(amount, { from: ownerAddress })
      ).to.emit(strategyContract, "Deposit");
    });
  });
});
