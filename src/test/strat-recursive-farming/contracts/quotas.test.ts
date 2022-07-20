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

  beforeEach(async () => {
    // prepare (signers) ownerWallet and userWallet (10 ETH each)
    [owner, user] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    userAddress = await user.getAddress();

    // get gas price and set decimals, for MOCKAgg contract, and for testing purpose
    gasPrice = await ethers.provider.getGasPrice();
    const decimals = BigNumber.from(18);

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
  });

  describe("getQuotaQty", () => {
    it("should return the quotas quantity calculated in the internal function", async () => {
      const amount = ethers.utils.parseEther("0.1");
      const quotasQty = await strategyContract.getQuotaQty(amount, {
        from: ownerAddress,
      });
      await expect(quotasQty._isBigNumber).to.be.true;
    });

    it("should revert if the sender isn't the owner", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await expect(
        strategyContract.getQuotaQty(amount, {
          from: userAddress,
        })
      ).to.be.reverted;
    });
  });

  describe("_getQuotaQty", () => {
    it("quotas should be 0 if the amount inserted is zero", async () => {
      const amount = ethers.utils.parseEther("0");
      const quotasQty = await strategyContract.getQuotaQty(amount, {
        from: ownerAddress,
      });

      logger.info(quotasQty.toString());
      expect(quotasQty).eq(BigNumber.from(0));
    });

    it("should return the amount * total supply price as result (when quota price is 1)", async () => {
      const quotaPrice = await strategyContract.getQuotaPrice({
        from: ownerAddress,
      });

      const amount = ethers.utils.parseEther("0.1");
      const quotasQty = await strategyContract.getQuotaQty(amount, {
        from: ownerAddress,
      });

      const quotasExpected = amount.mul(maxSupply);
      expect(quotasExpected).eq(quotasQty);
      expect(quotaPrice).eq(BigNumber.from(1));
    });

    it("should return the amount * the quota price as result (when quota price is not 1)", async () => {
      const [GAS_USED_DEPOSIT, GAS_USED_SUPPLY, ,] =
        await strategyContract.getGasInfo();

      const amount = ethers.utils.parseEther("0.1");

      const amountDeposited = amount;
      amountDeposited.add(amount);

      // aave user info mock constants
      const mockAvailableBorrowsBase = BigNumber.from("1").add(
        GAS_USED_DEPOSIT.add(GAS_USED_SUPPLY)
          .mul(gasPrice)
          .mul(gasPriceMultiplier)
      ); // if math comparisson + 1
      const mockTotalCollateralBase = amountDeposited;
      const mockTotalDebtBase = BigNumber.from("705414466");
      const mockCurrentLiquidationThreshold = BigNumber.from("8182");
      const mockLtv = BigNumber.from("7909");
      const mockHealthFactor = BigNumber.from("7723402410349775844");

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      const quotaPrice = await strategyContract.getQuotaPrice({
        from: ownerAddress,
      });
      logger.info(`quotaPrice ${quotaPrice.toString()}`);

      const quotasQty = await strategyContract.getQuotaQty(amount, {
        from: ownerAddress,
      });

      const quotasExpected = amount.mul(maxSupply).div(quotaPrice);
      logger.info(`quotasQty, ${quotasQty}`);
      logger.info(`quotasExpected, ${quotasExpected}`);
      expect(quotasExpected).eq(quotasQty);
    });
  });

  describe("getQuotaPrice", () => {
    it("should return the quota price calculation of the internal function", async () => {
      const quotaPrice = await strategyContract.getQuotaPrice({
        from: ownerAddress,
      });
      await expect(quotaPrice._isBigNumber).to.be.true;
    });

    it("should revert if the sender isn't the owner", async () => {
      await expect(
        strategyContract.getQuotaPrice({
          from: userAddress,
        })
      ).to.be.reverted;
    });
  });

  describe("_getQuotaPrice", () => {
    it("quota price should be 1 if isn't amount deposited", async () => {
      const quotaPrice = await strategyContract.getQuotaPrice({
        from: ownerAddress,
      });
      expect(quotaPrice).eq(BigNumber.from(1));
    });

    it("should calculate properly the quota price", async () => {
      const [GAS_USED_DEPOSIT, GAS_USED_SUPPLY, ,] =
        await strategyContract.getGasInfo();

      // aave user info mock constants
      const mockTotalCollateralBase = BigNumber.from("6658762878");
      const mockTotalDebtBase = BigNumber.from("705414466");
      const mockAvailableBorrowsBase = BigNumber.from("1").add(
        GAS_USED_DEPOSIT.add(GAS_USED_SUPPLY)
          .mul(gasPrice)
          .mul(gasPriceMultiplier)
      ); // if math comparisson + 1
      const mockCurrentLiquidationThreshold = BigNumber.from("8182");
      const mockLtv = BigNumber.from("7909");
      const mockHealthFactor = BigNumber.from("7723402410349775844");

      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      // calculations (the same as the contract)
      const profit = mockTotalCollateralBase.sub(mockTotalDebtBase);

      const expectedQuotaPrice = BigNumber.from(1).add(profit);
      const quotaPrice = await strategyContract.getQuotaPrice({
        from: ownerAddress,
      });

      expect(quotaPrice).eq(expectedQuotaPrice);
    });
  });

  describe("getAmountFromQuotas", () => {
    it("should return amount from quotas calculation of internal function", async () => {
      const quotas = BigNumber.from("12");
      const amountFromQuotas = await strategyContract.getAmountFromQuotas(
        quotas,
        {
          from: ownerAddress,
        }
      );
      await expect(amountFromQuotas._isBigNumber).to.be.true;
    });

    it("should revert if the sender isn't the owner", async () => {
      const quotas = BigNumber.from("12");
      await expect(
        strategyContract.getAmountFromQuotas(quotas, {
          from: userAddress,
        })
      ).to.be.reverted;
    });
  });

  describe("_getAmountFromQuotas", () => {
    it("should return total supply / amount if nothing is deposited yet, and quotaPrice is equal 1", async () => {
      const quotas = BigNumber.from("12");
      const amountFromQuotas = await strategyContract.getAmountFromQuotas(
        quotas,
        {
          from: ownerAddress,
        }
      );

      const quotasExpected = maxSupply.div(quotas);
      expect(amountFromQuotas).eq(quotasExpected);
    });

    it("should return 0 if the quotas value inserted is equal 0", async () => {
      const quotas = BigNumber.from("0");
      const amountFromQuotas = await strategyContract.getAmountFromQuotas(
        quotas,
        {
          from: ownerAddress,
        }
      );
      expect(amountFromQuotas).eq(BigNumber.from(0));
    });
  });
});
