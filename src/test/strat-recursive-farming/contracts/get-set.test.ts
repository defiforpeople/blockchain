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
use(waffleChai);

/* This tests that the set or update functions 
work correctly, using the get or view functions */

describe("StrategyRecursiveFarming", () => {
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let ownerAddress: string;

  let strategyContract: StrategyRecursiveFarming;
  let keeperInterval: BigNumber;
  let token: DFP;
  let mockV3Aggregator: MockV3Aggregator;
  let mockIncentivesCont: MockContract;
  let gasPrice: BigNumber;
  let poolMock: MockPoolDFP;
  let gasPriceMultiplier: BigNumber;
  let aaveRefCode: BigNumber;

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

    // get aave ref code
    aaveRefCode = await strategyContract.getAaveRefCode();
  });

  describe("setGasPriceMultiplier", () => {
    it("should revert if the sender isn't the owner", async () => {
      const gasPrice = BigNumber.from("4");
      await expect(
        strategyContract.setGasPriceMultiplier(gasPrice, {
          from: userAddress,
        })
      ).to.be.reverted;
    });

    it("should update the gasPriceMultiplier", async () => {
      const gasPriceToUpdate = BigNumber.from("3");
      await strategyContract.setGasPriceMultiplier(gasPriceToUpdate, {
        from: ownerAddress,
      });

      const gasPriceMulAfter = await strategyContract.getGasPriceMultiplier();

      expect(gasPriceMulAfter).eq(gasPriceToUpdate);
      expect(gasPriceMulAfter).not.to.be.eq(gasPriceMultiplier);
    });

    it("shouldn't update if gasPriceMultiplier is the same than before", async () => {
      const gasPriceToUpdate = gasPriceMultiplier;
      await strategyContract.setAaveRefCode(gasPriceToUpdate, {
        from: ownerAddress,
      });

      const gasPriceMulAfter = await strategyContract.getGasPriceMultiplier();

      expect(gasPriceMulAfter).eq(gasPriceMultiplier);
    });
  });

  describe("setAaveRefCode", () => {
    it("should revert if the sender isn't the owner", async () => {
      const aaveRefToUpdate = BigNumber.from("2");
      await expect(
        strategyContract.setAaveRefCode(aaveRefToUpdate, {
          from: userAddress,
        })
      ).to.be.reverted;
    });

    it("should update the aaveRefCode", async () => {
      const aaveRefToUpdate = BigNumber.from("1");
      await strategyContract.setAaveRefCode(aaveRefToUpdate, {
        from: ownerAddress,
      });

      const aaveRefAfter = await strategyContract.getAaveRefCode();

      expect(aaveRefAfter).eq(aaveRefToUpdate);
      expect(aaveRefAfter).not.to.be.eq(aaveRefCode);
    });

    it("shouldn't update if aaveRefCode is the same than before", async () => {
      const aaveRefToUpdate = aaveRefCode;
      await strategyContract.setAaveRefCode(aaveRefToUpdate, {
        from: ownerAddress,
      });

      const aaveRefAfter = await strategyContract.getAaveRefCode();

      expect(aaveRefAfter).eq(aaveRefCode);
    });
  });

  describe("updateInterval", () => {
    it("should revert if the sender isn't the owner", async () => {
      const intervalToUpdate = BigNumber.from("600");
      await expect(
        strategyContract.updateInterval(intervalToUpdate, {
          from: userAddress,
        })
      ).to.be.reverted;
    });

    it("should update the interval", async () => {
      const intervalToUpdate = BigNumber.from("600");
      await strategyContract.updateInterval(intervalToUpdate, {
        from: ownerAddress,
      });

      const intervalAfter = await strategyContract.getInterval();

      expect(intervalAfter).eq(intervalToUpdate);
      expect(intervalAfter).not.to.be.eq(keeperInterval);
    });

    it("shouldn't update if interval is the same than before", async () => {
      const intervalToUpdate = keeperInterval;
      await strategyContract.updateInterval(intervalToUpdate, {
        from: ownerAddress,
      });

      const intervalAfter = await strategyContract.getInterval();

      expect(intervalAfter).eq(keeperInterval);
    });
  });

  describe("getQuotasPerAddress", () => {
    it("should return 0 if the investor didn't deposit yet", async () => {
      const quotasQtyAddress = await strategyContract.getQuotasPerAddress(
        userAddress
      );
      expect(quotasQtyAddress).eq(BigNumber.from(0));
    });

    it("should return correctly the quotas that the address has", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      // external function that returns quotas given an amount
      const quotasQty = await strategyContract.getQuotaQty(amount);
      // contract function that returns quotas given an address (in this case, after updating the state with deposit function)
      const quotasQtyAddress = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );

      expect(quotasQtyAddress).eq(quotasQty);
    });
  });

  describe("claimRewards", () => {
    it("should revert if the sender isn't the owner", async () => {
      await expect(strategyContract.claimRewards({ from: userAddress })).to.be
        .reverted;
    });

    it("should claim rewards successfully", async () => {
      const tokenAddresses = await strategyContract.getTokenAddresses();
      await mockIncentivesCont.mock.claimAllRewardsToSelf.returns(
        tokenAddresses,
        tokenAddresses
      );

      await expect(strategyContract.claimRewards({ from: ownerAddress })).to.be
        .calledOnContract;
    });
  });
});
