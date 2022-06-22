// eslint-disable-next-line camelcase
import {
  StrategyRecursiveFarming,
  // eslint-disable-next-line camelcase
  StrategyRecursiveFarming__factory,
  MockV3Aggregator,
  DFP,
  MockPoolDFP,
  // eslint-disable-next-line camelcase
  IRewardsController__factory,
} from "../typechain";
import { assert, expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import {
  deployMockContract,
  MockContract,
  // eslint-disable-next-line node/no-extraneous-import
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
      // eslint-disable-next-line camelcase
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
});
