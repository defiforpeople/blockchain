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
import { network, ethers } from "hardhat";
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
  let token: DFP;
  let mockV3Aggregator: MockV3Aggregator;
  let mockIncentivesCont: MockContract;
  let gasPrice: BigNumber;
  let poolMock: MockPoolDFP;
  let gasPriceMultiplier: BigNumber;
  let deployTimestamp: BigNumber;

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

    // get timestamp when the strategy contract was deployed
    deployTimestamp = await strategyContract.getLastTimestamp({
      from: ownerAddress,
    });
  });

  describe("checkUpkeep", () => {
    it("Should return false if status is Pristine but interval is ok and withdraw is false", async () => {
      // callStatic is for getting variable of a function that reuturns nothing
      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        []
      );

      await expect(upkeepNeeded).to.be.false;
    });

    it("Should return false if status is Done but interval is ok and status is false", async () => {
      const amount = ethers.utils.parseEther("0.1");

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      // aave user info mock constants
      const mockTotalCollateralBase = BigNumber.from("6658762878");
      const mockTotalDebtBase = BigNumber.from("705414466");
      const mockAvailableBorrowsBase = BigNumber.from(0); // For updating status to Done and not to Borrow
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

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep([]);

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        []
      );
      await expect(upkeepNeeded).to.be.false;
    });

    it("should return false if interval is not reach yet but status is Borrow", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      // The status of the strategy should be Borrow in this point
      const status = await strategyContract.getStatus();

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        "0x"
      );

      await expect(upkeepNeeded).to.be.false;
      expect(status).to.equal(StrategyStatus.Borrow);
    });

    it("should return false if interval is not reach yet but status is Supply", async () => {
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

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      // The status of the strategy should be Borrow in this point

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        "0x"
      );
      const status = await strategyContract.getStatus();

      expect(status).to.be.equal(StrategyStatus.Supply);
      await expect(upkeepNeeded).to.be.false;
    });

    it("should return true if interval is reach and status is Borrow", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      // The status of the strategy should be Borrow in this point

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        "0x"
      );

      await expect(upkeepNeeded).to.be.true;
    });

    it("should return false if interval is reach, status is Supply but withdraw is true", async () => {
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

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      // The status of the strategy should be Borrow in this point

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      const reqPercentage = BigNumber.from("100");
      await strategyContract.requestWithdraw(reqPercentage, {
        from: ownerAddress,
      });

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        "0x"
      );

      const withdrawing = await strategyContract.getWithdrawStatus({
        from: ownerAddress,
      });

      await expect(withdrawing).to.be.true;
      await expect(upkeepNeeded).to.be.false;
    });

    it("should return false if interval is reach, status is Borrow but withdraw is true", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      // The status of the strategy should be Borrow in this point

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      const reqPercentage = BigNumber.from("100");
      await strategyContract.requestWithdraw(reqPercentage, {
        from: ownerAddress,
      });

      const { upkeepNeeded } = await strategyContract.callStatic.checkUpkeep(
        "0x"
      );

      const withdrawing = await strategyContract.getWithdrawStatus({
        from: ownerAddress,
      });

      await expect(withdrawing).to.be.true;
      await expect(upkeepNeeded).to.be.false;
    });
  });

  describe("performUpkeep", () => {
    it("should revert if checkUpkeep is false and shouldn't update '_lastTimestamp'", async () => {
      const status = await strategyContract.getStatus();
      const lastTimestamp = (
        await strategyContract.getLastTimestamp({
          from: ownerAddress,
        })
      ).add(1); // what the execution of perform upkeep lasts is 1 sec
      const firstTimestamp = await strategyContract.getLastTimestamp();

      await expect(strategyContract.performUpkeep([])).to.be.revertedWith(
        `Error__UpkeepNotNeeded(${status}, ${lastTimestamp.sub(
          deployTimestamp
        )}, ${keeperInterval})`
      );
      expect(await strategyContract.getLastTimestamp()).to.eq(firstTimestamp);
    });

    it("Should borrow in the protocol and update status to Supply and should update '_lastTimestamp'", async () => {
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
      // The status of the strategy should be Borrow in this point

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await expect(() =>
        strategyContract.performUpkeep("0x")
      ).to.changeTokenBalance(
        token,
        strategyContract,
        mockAvailableBorrowsBase
      );
      expect(await strategyContract.getStatus()).to.eq(StrategyStatus.Supply);
    });

    it("Should execute supply to aave, and update status to Borrow and should update '_lastTimestamp'", async () => {
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
      // The status of the strategy should be Borrow in this point

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      const contractBalance = await token.balanceOf(strategyContract.address);
      const firstTimestamp = await strategyContract.getLastTimestamp();

      await expect(() =>
        strategyContract.performUpkeep("0x")
      ).to.changeTokenBalance(token, poolMock, contractBalance);
      expect(await strategyContract.getLastTimestamp()).to.be.gt(
        firstTimestamp
      );
      expect(await strategyContract.getStatus()).to.eq(StrategyStatus.Borrow);
    });

    it("Should update status from Borrow to Done when borrowAvailable is not enough and should update '_lastTimestamp'", async () => {
      const [GAS_USED_DEPOSIT, GAS_USED_SUPPLY, ,] =
        await strategyContract.getGasInfo();

      // aave user info mock constants
      const mockTotalCollateralBase = BigNumber.from("6658762878");
      const mockTotalDebtBase = BigNumber.from("705414466");
      let mockAvailableBorrowsBase = BigNumber.from("1").add(
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
      // The status of the strategy should be Borrow in this point

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      mockAvailableBorrowsBase = BigNumber.from("0");
      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      const firstTimestamp = await strategyContract.getLastTimestamp();
      await strategyContract.performUpkeep("0x");
      const secondTimestamp = await strategyContract.getLastTimestamp();

      expect(secondTimestamp).to.be.gt(firstTimestamp);
      expect(await strategyContract.getStatus()).to.eq(StrategyStatus.Done);
    });

    it("Should update status from Supply to Done when the balance is not enough and should update '_lastTimestamp'", async () => {
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
      // The status of the strategy should be Borrow in this point

      // mock aave user info
      await poolMock.setUserAccountData(
        mockTotalCollateralBase,
        mockTotalDebtBase,
        mockAvailableBorrowsBase,
        mockCurrentLiquidationThreshold,
        mockLtv,
        mockHealthFactor
      );

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      await strategyContract.performUpkeep("0x");

      // we mock the gas price in order to make the balance of the strategy contract to be insufficient
      const contractBalance = await token.balanceOf(strategyContract.address);
      gasPrice = contractBalance.add("1");
      logger.info("gasPrice (test): ", gasPrice);
      await mockV3Aggregator.updateAnswer(gasPrice);

      await network.provider.send("evm_increaseTime", [
        keeperInterval.toNumber() + 1,
      ]);
      await network.provider.send("evm_mine", []);

      const firstTimestamp = await strategyContract.getLastTimestamp();
      await strategyContract.performUpkeep("0x");
      const secondTimestamp = await strategyContract.getLastTimestamp();

      expect(secondTimestamp).to.be.gt(firstTimestamp);
      expect(await strategyContract.getStatus()).to.eq(StrategyStatus.Done);
    });
  });
});
