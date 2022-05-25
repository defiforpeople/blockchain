import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
// eslint-disable-next-line camelcase
import {
  // eslint-disable-next-line camelcase
  IERC20__factory,
  IERC20,
  StrategyRecursiveFarming,
  // eslint-disable-next-line camelcase
  LinkTokenInterface__factory,
  LinkTokenInterface,
} from "../../typechain";
import { getWeth } from "../../utils/helpers/get-weth";
import { linkFund } from "../../utils/helpers/link-fund";
const logger = require("pino")();

const { WRAPPED_NATIVE_TOKEN_ADDRESS, CONTRACT_ADDRESS, LINK_ADDRESS } =
  process.env;
const GAS_LIMIT = 2074040;
const AMOUNT = BigNumber.from(1000000000);

const doRecursion = async (): Promise<void> => {
  const [wallet] = await ethers.getSigners();
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );

  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  const linkToken = (await ethers.getContractAt(
    LinkTokenInterface__factory.abi,
    `${LINK_ADDRESS}`
  )) as LinkTokenInterface;

  try {
    const borrow = 0;
    const supply = 1;
    const done = 2;

    let strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);
    if (strategyStatus === done) {
      logger.info("The strategy is in DONE status");
      return;
    }

    // The following was commented because something fails:
    // await logger.info("checking if the contract has enough LINK");
    // const linkNeeded = await strategy.linkNeeded({ // FAILS
    //   from: wallet.address,
    //   gasLimit: GAS_LIMIT,
    // });
    // if (linkNeeded > BigNumber.from("0")) {
    //   if ((await linkToken.balanceOf(wallet.address)) < linkNeeded) {
    //     logger.info("The owner wallet hasn't enough LINK for funding!");
    //     return;
    //   }
    //   logger.info("Funding LINK...");
    //   await linkFund(wallet.address, linkNeeded);
    //   logger.info("LINK transfered to smart contract!");
    // }

    // TODO(nb): question: don't know if calculating the owner wallet gas is necessary
    // if (
    //   (await strategy.gasNeeded({
    //     from: wallet.address,
    //     gasLimit: GAS_LIMIT,
    //   })) > BigNumber.from("0")
    // ) {
    //   // TODO(nb): method for adding gas to the wallet owner
    //   logger.info("The owner wallet hasn't enough gas!");
    //   return;
    // }

    await logger.info("Executing Recursion function...");
    const tx = await strategy.doRecursion({
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();

    strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);

    if (strategyStatus === supply) {
      await logger.info("Executing Supply...");
      const tx = await strategy.doRecursion({
        from: wallet.address,
        gasLimit: GAS_LIMIT,
      });
      await tx.wait();
    }
    strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);
  } catch (err) {
    logger.error(err);
  }
};

const doDeposit = async (amount: BigNumber): Promise<void> => {
  const [wallet] = await ethers.getSigners();
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );

  const strategy = (await strategyContract.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  // define instance of erc20 token
  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
  )) as IERC20;
  // make approve tx to erc20 token contract and wait confirmation
  await logger.info("Approving...");
  const tx = await token.approve(`${CONTRACT_ADDRESS}`, amount, {
    from: wallet.address,
    gasLimit: GAS_LIMIT,
  });
  await tx.wait();
  await logger.info("Approved...");

  await logger.info("Supplying...");
  const depositTx = await strategy.deposit(amount, {
    from: wallet.address,
    gasLimit: GAS_LIMIT,
  });
  await depositTx.wait();
  await logger.info("Supplied...");

  logger.info("Going to Recursion function....");
  await doRecursion();
};

const reqWithdraw = async (
  userAddr: string,
  amount: BigNumber
): Promise<void> => {
  const [wallet] = await ethers.getSigners();
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );

  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  logger.info("Executing requestWithdraw");
  const reqTx = await strategy.requestWithdraw(amount, {
    from: userAddr,
    gasLimit: GAS_LIMIT,
  });
  await reqTx.wait();
  await logger.info(reqTx);

  await logger.info("Executing Withdraw");
  // TODO(nb): try to do it with events
  const withdrawTx = await strategy._withdraw(userAddr, amount, {
    from: wallet.address,
    // TODO(nb): question: is possible to sign this tx with the user address too?
    gasLimit: GAS_LIMIT,
  });
  await withdrawTx.wait();
  await logger.info(withdrawTx);
};

const main = async () => {
  const [wallet] = await ethers.getSigners();

  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
  )) as IERC20;

  const wavaxBalance = await token.balanceOf(wallet.address);
  await logger.info(`Our current amount of WAVAX is ${wavaxBalance}`);

  if (wavaxBalance < AMOUNT) {
    await logger.info("Getting WAVAX...");
    await getWeth(wallet.address, AMOUNT.sub(wavaxBalance));
    await logger.info(
      `WAVAX tx completed, our amount is: ${token.balanceOf(wallet.address)}`
    );
  }
  await logger.info("Doing Deposit...");
  await doDeposit(AMOUNT); // Don't have more amount :(

  await logger.info("Requesting Withdraw...");
  await reqWithdraw(wallet.address, BigNumber.from("100"));
};

main();
