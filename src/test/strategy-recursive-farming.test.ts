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
import { network, ethers } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, Signer } from "ethers";
import { stat } from "fs";
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
  let mockIncentivesCont: MockIncentivesController;
  let gasPrice: BigNumber;
  let poolMock: MockPoolDFP;
  let gasPriceMultiplier: BigNumber;
  let deployTimestamp: BigNumber;
  let aaveRefCode: BigNumber;
  let interval: BigNumber;

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

    // get and deploy StrategyRecursiveFarming contract
    const strategyRecursiveFarming = (await ethers.getContractFactory(
      "StrategyRecursiveFarming"
      // eslint-disable-next-line camelcase
    )) as StrategyRecursiveFarming__factory;

    // define keeperInterval for deploying the strategy contract
    keeperInterval = BigNumber.from(300); // define interval for keeper to execute
    gasPriceMultiplier = BigNumber.from(1); // define gas price multiplier for testing

    strategyContract = await strategyRecursiveFarming.deploy(
      poolMock.address,
      mockV3Aggregator.address,
      token.address,
      mockIncentivesCont.address,
      keeperInterval,
      gasPriceMultiplier
    );
    await strategyContract.deployed();

    deployTimestamp = await strategyContract.getLastTimestamp({
      from: ownerAddress,
    });
    // get max supply
    maxSupply = await token.totalSupply();
    aaveRefCode = await strategyContract.getAaveRefCode();
    interval = await strategyContract.getInterval();
  });

  describe("constructor", () => {
    it("Initializes the strategy correctly", async () => {
      const status = await strategyContract.getStatus();
      const interval = await strategyContract.getInterval();
      const lastTimestamp = await strategyContract.getLastTimestamp({
        from: ownerAddress,
      });
      const maxSupplyContract = await strategyContract.getTotalSupply();
      const gasPriceMultiplierContract =
        await strategyContract.getGasPriceMultiplier();

      expect(status).to.equal(StrategyStatus.Pristine);
      expect(interval).to.equal(keeperInterval);
      assert(lastTimestamp > BigNumber.from(0));
      expect(maxSupplyContract.toString()).to.equal(maxSupply.toString());
      expect(gasPriceMultiplierContract).to.equal(gasPriceMultiplier);
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
      assert(quota > BigNumber.from(0));
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

      assert(!upkeepNeeded);
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
      assert(!upkeepNeeded);
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

      expect(status).to.equal(StrategyStatus.Borrow);
      assert(!upkeepNeeded);
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
      assert(!upkeepNeeded);
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

      assert(upkeepNeeded);
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

      assert(withdrawing);
      assert(!upkeepNeeded);
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

      assert(withdrawing);
      assert(!upkeepNeeded);
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
      assert((await strategyContract.getStatus()) === StrategyStatus.Supply);
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
      assert((await strategyContract.getStatus()) === StrategyStatus.Borrow);
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
      assert((await strategyContract.getStatus()) === StrategyStatus.Done);
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
      assert((await strategyContract.getStatus()) === StrategyStatus.Done);
    });
  });

  // Implement aToken in MockPool
  describe("requestWithdraw", () => {
    it("Should revert if the percentage for withdraw is zero", async () => {
      const quotasPercentage = BigNumber.from("0");
      await expect(
        strategyContract.requestWithdraw(quotasPercentage, {
          from: ownerAddress,
        })
      ).to.be.revertedWith(`Error__PercentageOutOfRange(${quotasPercentage})`);
    });

    it("Should revert if the percentage for withdraw is more than one hundred", async () => {
      const quotasPercentage = BigNumber.from("101");
      await expect(
        strategyContract.requestWithdraw(quotasPercentage, {
          from: ownerAddress,
        })
      ).to.be.revertedWith(`Error__PercentageOutOfRange(${quotasPercentage})`);
    });

    it("Should revert if sender's quotas balance is 0", async () => {
      const quotasRequested = BigNumber.from("1");
      // const quotasBalance = await strategyContract.getQuotasPerAddress(
      //   ownerAddress
      // );
      // const quotasToWithdraw = quotasRequested.mul(quotasBalance).div(100);
      await expect(
        strategyContract.requestWithdraw(quotasRequested, {
          from: ownerAddress,
        })
      ).to.be.revertedWith(`Error__UserHasZeroQuotas()`);
    });

    it("should execute the repay from aave to the sender when is the first time", async () => {
      const amount = ethers.utils.parseEther("0.1");

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      const firstQuotas = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );

      const reqPercentage = BigNumber.from("100");
      const tx = await strategyContract.requestWithdraw(reqPercentage, {
        from: ownerAddress,
      });

      const secondQuotas = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );

      expect(tx).to.changeTokenBalance(token, owner, amount);
      expect(firstQuotas).gt(secondQuotas);
    });

    it("should execute the repay from aave to the sender after multiple deposits", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      const amountDeposited = amount;

      const firstQuotas = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );
      const quotasBeforeWithdraw = firstQuotas;
      const zero = BigNumber.from(0);
      await poolMock.setUserAccountData(amount, zero, zero, zero, zero, zero);

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });
      amountDeposited.add(amount);

      const secondQuotas = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );
      quotasBeforeWithdraw.add(secondQuotas);

      const firstBalance = await token.balanceOf(ownerAddress);

      const reqPercentage = BigNumber.from("100");

      const secondBalance = await token.balanceOf(ownerAddress);

      await strategyContract.requestWithdraw(reqPercentage, {
        from: ownerAddress,
      });
      const quotasAfterWithdraw = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );

      expect(firstBalance).to.eq(secondBalance);
      expect(quotasBeforeWithdraw).gt(quotasAfterWithdraw);
    });

    it("should emit event if the requestWithdraw finishes successfully", async () => {
      const amount = ethers.utils.parseEther("0.1");

      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      const reqPercentage = BigNumber.from("100");
      const tx = await strategyContract.requestWithdraw(reqPercentage, {
        from: ownerAddress,
      });

      expect(tx).to.emit(
        strategyContract,
        `Withdraw(${ownerAddress}, ${reqPercentage})`
      );
    });
  });

  describe("withdraw", () => {
    it("should revert if the sender isn't the owner", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await expect(
        strategyContract.withdraw(userAddress, amount, {
          from: userAddress,
        })
      ).to.be.reverted;
    });

    it("should withdraw the requested amount to the address", async () => {
      const amount = ethers.utils.parseEther("0.1");
      await token.approve(strategyContract.address, amount, {
        from: ownerAddress,
      });
      await strategyContract.deposit(amount, { from: ownerAddress });

      const firstTotalInvested = await strategyContract.getTotalInvested();
      const reqPercentage = BigNumber.from("100");
      await strategyContract.requestWithdraw(reqPercentage, {
        from: ownerAddress,
      });

      await new Promise((resolve, reject) => {
        strategyContract.once(
          "Withdraw",
          async (userAddr: string, amount: BigNumber, quotas: BigNumber) => {
            try {
              logger.info("Withdraw event listened!");

              expect(
                await strategyContract.withdraw(userAddr, amount, {
                  from: ownerAddress,
                })
              ).to.changeTokenBalance(token, userAddr, amount);

              const secondTotalInvested =
                await strategyContract.getTotalInvested();
              assert(firstTotalInvested.sub(secondTotalInvested).eq(amount));

              resolve("");
            } catch (err) {
              reject(err);
            }
          }
        );
      });
    });
  });

  describe("getQuotaQty", () => {
    it("should return the quotas quantity calculated in the internal function", async () => {
      const amount = ethers.utils.parseEther("0.1");
      const quotasQty = await strategyContract.getQuotaQty(amount, {
        from: ownerAddress,
      });
      assert(quotasQty._isBigNumber);
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
      // await token.approve(strategyContract.address, amount, {
      //   from: ownerAddress,
      // });
      // await strategyContract.deposit(amount, { from: ownerAddress });
      const amountDeposited = amount;

      // await token.approve(strategyContract.address, amount, {
      //   from: userAddress,
      // });
      // await strategyContract.deposit(amount, { from: userAddress });
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
      assert(quotaPrice._isBigNumber);
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

      const contractBalance = await token.balanceOf(strategyContract.address);
      const totalInvested = await strategyContract.getTotalInvested();
      const totalSupply = await strategyContract.getTotalSupply();

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
      assert(amountFromQuotas._isBigNumber);
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
      assert(gasPriceMulAfter !== gasPriceMultiplier);
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
      assert(aaveRefAfter !== aaveRefCode);
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
      assert(intervalAfter !== interval);
    });

    it("shouldn't update if interval is the same than before", async () => {
      const intervalToUpdate = interval;
      await strategyContract.updateInterval(intervalToUpdate, {
        from: ownerAddress,
      });

      const intervalAfter = await strategyContract.getInterval();

      expect(intervalAfter).eq(interval);
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

      const quotasQty = await strategyContract.getQuotaQty(amount);
      const quotasQtyAddress = await strategyContract.getQuotasPerAddress(
        ownerAddress
      );

      expect(quotasQtyAddress).eq(quotasQty);
    });
  });
});
