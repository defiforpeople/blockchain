import {
  SupplyAave,
  DFP,
  SupplyAave__factory,
  MockPoolDFP,
} from "../../../typechain";
import { expect, use } from "chai";
import "@nomiclabs/hardhat-ethers";
import { ethers } from "hardhat";
import { waffleChai } from "@ethereum-waffle/chai";
import { BigNumber, Signer } from "ethers";
const logger = require("pino")();
use(waffleChai);

describe("SupplyAave", () => {
  let owner: Signer;
  let user: Signer;
  let userAddress: string;
  let ownerAddress: string;

  let strategyContract: SupplyAave;
  let token: DFP;
  let poolMock: MockPoolDFP;
  let aaveRefCode: BigNumber;

  beforeEach(async () => {
    // prepare (signers) ownerWallet and userWallet (10 ETH each)
    [owner, user] = await ethers.getSigners();
    ownerAddress = await owner.getAddress();
    userAddress = await user.getAddress();

    // // define AavePool mock contract
    const poolFactory = await ethers.getContractFactory("MockPoolDFP");
    poolMock = (await poolFactory.deploy()) as MockPoolDFP;

    // define token mock contract (DFP token our own token for testing)
    const tokenFactory = await ethers.getContractFactory("DFP");
    token = (await tokenFactory.deploy()) as DFP;

    // get wrapped native token to owner and user wallets
    await token.mint(ownerAddress, ethers.utils.parseEther("1.0"));
    await token.mint(userAddress, ethers.utils.parseEther("1.0"));

    // get and deploy StrategyRecursiveFarming contract
    const stratSupplyAave = (await ethers.getContractFactory(
      "SupplyAave"
    )) as SupplyAave__factory;

    aaveRefCode = BigNumber.from("0");

    // deploy strategy contract
    strategyContract = await stratSupplyAave.deploy(
      poolMock.address,
      aaveRefCode
    );
    await strategyContract.deployed();
  });

  describe("constructor", () => {
    it("should initialize the variables correctly after deploying the contract", async () => {
      const aavePoolContract = await strategyContract.AAVE_POOL();
      const aaveRefCodeContract = await strategyContract.AAVE_REF_CODE();

      expect(aavePoolContract).to.equal(poolMock.address);
      expect(aaveRefCodeContract).to.equal(aaveRefCode);
    });
  });

  describe("deposit", () => {
    it("should fail if the user didn't give enough allowance for providing liquidity", async () => {
      const approveAmount = ethers.utils.parseEther("0.5");
      const approveTx = await token
        .connect(user)
        .approve(strategyContract.address, approveAmount, {
          from: userAddress,
        });
      await approveTx.wait();

      // signatures
      const permitV = BigNumber.from(`${approveTx.v}`);
      const permitR = `${approveTx.r}`;
      const permitS = `${approveTx.s}`;

      const deadline = BigNumber.from((Date.now() + 3600).toString());

      const depositAmount = approveAmount.mul(2);

      await expect(
        strategyContract
          .connect(user)
          .deposit(
            depositAmount,
            token.address,
            deadline,
            permitV,
            permitR,
            permitS,
            {
              from: userAddress,
            }
          )
      ).to.be.revertedWith(
        `Error__NotEnoughAllowance(${approveAmount}, ${depositAmount})`
      );
    });

    it("should fail if the amount for deposit is zero", async () => {
      const amount = ethers.utils.parseEther("0");
      const approveTx = await token
        .connect(user)
        .approve(strategyContract.address, amount, {
          from: userAddress,
        });
      await approveTx.wait();

      // signatures
      const permitV = BigNumber.from(`${approveTx.v}`);
      const permitR = `${approveTx.r}`;
      const permitS = `${approveTx.s}`;

      const deadline = BigNumber.from((Date.now() + 3600).toString());

      await expect(
        strategyContract
          .connect(user)
          .deposit(amount, token.address, deadline, permitV, permitR, permitS, {
            from: userAddress,
          })
      ).to.be.revertedWith(`Error__AmountIsZero()`);
    });

    it("should fail if the amount for deposit() is greater than the sender balance", async () => {
      const balance = await token.balanceOf(userAddress);
      const amount = balance.add(1);
      const approveTx = await token
        .connect(user)
        .approve(strategyContract.address, amount, {
          from: userAddress,
        });
      await approveTx.wait();

      // signatures
      const permitV = BigNumber.from(`${approveTx.v}`);
      const permitR = `${approveTx.r}`;
      const permitS = `${approveTx.s}`;

      const deadline = BigNumber.from((Date.now() + 3600).toString());

      await expect(
        strategyContract
          .connect(user)
          .deposit(amount, token.address, deadline, permitV, permitR, permitS, {
            from: userAddress,
          })
      ).to.be.revertedWith(`Error__NotEnoughBalance(${balance}, ${amount})`);
    });

    // TODO(nb): Do these tests
    it("should supply liquidity to aave successfully", async () => {});

    it("should emit the event correctly after supplying liquidity to aave", async () => {});
  });

  describe("withdraw", () => {
    it("should fail if the lp amount for withdraw is zero", async () => {
      const amount = ethers.utils.parseEther("0");

      await expect(
        strategyContract.connect(user).withdraw(amount, token.address, {
          from: userAddress,
        })
      ).to.be.revertedWith(`Error__AmountIsZero()`);
    });

    it("should fail if the lp amount for withdraw is greater than the sender lp amount's balance", async () => {
      const balance = await token.balanceOf(userAddress);
      const amount = balance.add(1);

      await expect(
        strategyContract.connect(user).withdraw(amount, token.address, {
          from: userAddress,
        })
      ).to.be.revertedWith(`Error__NotEnoughBalance(${balance}, ${amount})`);
    });

    //TODO:
    it("should withdraw successfully", async () => {});

    it("should emit event correctly after withdrawing", async () => {});
  });
});
