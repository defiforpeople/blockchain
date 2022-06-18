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
  let gasPriceMultiplier: BigNumber;
  let deployTimestamp: BigNumber;

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
  });

  describe("constructor", () => {
    it("Initializes the strategy correctly", async () => {
      const status = await strategyContract.getStatus();
      const interval = await strategyContract.getInterval();
      const lastTimestamp = await strategyContract.getLastTimestamp({
        from: ownerAddress,
      });
      const maxSupplyContract = await strategyContract.getMaxSupply();
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
      await expect(
        strategyContract.deposit(amount, { from: ownerAddress })
      ).to.be.revertedWith("Error__NotEnoughBalance()");
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
    it("Should return false if status is Pristine but interval is ok", async () => {
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

    it("Should return false if status is Done but interval is ok", async () => {
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
});
