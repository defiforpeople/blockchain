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

// defined constants
const { WRAPPED_NATIVE_TOKEN_ADDRESS, CONTRACT_ADDRESS, LINK_ADDRESS } =
  process.env;
const GAS_LIMIT = 2074040;
const AMOUNT = BigNumber.from(1000000000);
const WITHDRAW_AMOUNT = BigNumber.from(100);

// method for executing recursion based on the contract status (supply or borrow)
const doRecursion = async (): Promise<void> => {
  // get the owner wallet
  const [wallet] = await ethers.getSigners();

  // get the contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  // get the LINK token
  const linkToken = (await ethers.getContractAt(
    LinkTokenInterface__factory.abi,
    `${LINK_ADDRESS}`
  )) as LinkTokenInterface;

  // evaluating LINK amount of the wallet owner before executing (for testing)
  let contractLinkAmm = await linkToken.balanceOf(wallet.address);
  await logger.info(
    `the wallet amount of LINK after recursion is: ${contractLinkAmm}`
  );

  // evaluating LINK amount of the smart contract before executing (for testing)
  let walletLinkAmm = await linkToken.balanceOf(`${CONTRACT_ADDRESS}`);
  await logger.info(
    `the wallet amount of LINK after recursion is: ${walletLinkAmm}`
  );

  try {
    // define constants for possible smart contract status
    const borrow = 0;
    const supply = 1;
    const done = 2;

    // print the strategy status
    let strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);

    // if the status is done, recursion is not necessary
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

    // start execution of the recursion
    await logger.info("Executing Recursion function...");
    const tx = await strategy.doRecursion({
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();

    // get and print the strategy status
    strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);

    // if the status if supply, then execute again doRecursion()
    if (strategyStatus === supply) {
      await logger.info("Executing Supply...");
      const tx = await strategy.doRecursion({
        from: wallet.address,
        gasLimit: GAS_LIMIT,
      });
      await tx.wait();
    }

    // get and print the strategy status
    strategyStatus = await strategy.viewStatus();
    await logger.info(`The status of the strategy is ${strategyStatus}`);

    // evaluating LINK amount of the wallet owner after executing (for testing)
    contractLinkAmm = await linkToken.balanceOf(wallet.address);
    await logger.info(
      `the wallet amount of LINK after recursion is: ${contractLinkAmm}`
    );

    // evaluating LINK amount of the smart contract after executing (for testing)
    walletLinkAmm = await linkToken.balanceOf(`${CONTRACT_ADDRESS}`);
    await logger.info(
      `the wallet amount of LINK after recursion is: ${walletLinkAmm}`
    );
  } catch (err) {
    logger.error(err);
  }
};

// function for user to deposit in the smart contract and start strategy
const doDeposit = async (
  userAddr: string,
  amount: BigNumber
): Promise<void> => {
  // get the strategy contract
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyContract.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

  // define instance of erc20 token
  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
  )) as IERC20;

  // make approve tx to erc20 token contract and wait confirmation
  await logger.info("Approving...");
  const tx = await token.approve(`${CONTRACT_ADDRESS}`, amount, {
    from: userAddr,
    gasLimit: GAS_LIMIT,
  });
  await tx.wait();
  await logger.info("Approved...");

  // execute deposit() in the strategy contract
  await logger.info("Depositing...");
  const depositTx = await strategy.deposit(amount, {
    from: userAddr,
    gasLimit: GAS_LIMIT,
  });
  await depositTx.wait();
  await logger.info("Deposited...");

  logger.info("Going to Recursion function....");
  // call function for executing recursion
  await doRecursion();
};

// function for user to request withdraw
const reqWithdraw = async (
  userAddr: string,
  amount: BigNumber
): Promise<void> => {
  // get the wallet owner
  const [wallet] = await ethers.getSigners();

  // get strategy contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  try {
    // execute requestWithdraw from user address and with the amount to withdraw
    logger.info("Executing requestWithdraw");
    const reqTx = await strategy.requestWithdraw(amount, {
      from: userAddr,
      gasLimit: GAS_LIMIT,
    });
    await reqTx.wait();

    // after it finishes, it calls the withdraw function in the contract for withdraw that amount of aave ans transfer it to user address
    await logger.info("Executing Withdraw");
    // TODO(nb): try to do it with events
    const withdrawTx = await strategy.withdraw(userAddr, amount, {
      from: wallet.address,
      // TODO(nb): question: is possible to sign this tx with the user address too?
      gasLimit: GAS_LIMIT,
    });
    await withdrawTx.wait();
    await logger.info(withdrawTx);
  } catch (err) {
    logger.error(err);
  }
};

// function for managing the execution flow of the other functions
const main = async () => {
  // get the owner wallet
  const [wallet] = await ethers.getSigners();

  // get the ERC20 native token (WAVAX in this case)
  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
  )) as IERC20;

  // get and print WAVAX balance before executing
  let wavaxBalance = await token.balanceOf(wallet.address);
  await logger.info(
    `Our amount of WAVAX in the wallet before execution is ${wavaxBalance}`
  );

  // if we don't have enough WAVAX in the wallet, we'll wrapp it from our AVAX
  if (wavaxBalance < AMOUNT) {
    await logger.info("Getting WAVAX...");
    await getWeth(wallet.address, AMOUNT.sub(wavaxBalance));
    await logger.info(
      `WAVAX tx completed, our amount is: ${token.balanceOf(wallet.address)}`
    );
  }

  // execute Deposit function from the address sender (in this case, the owner wallet)
  await logger.info("Doing Deposit...");
  await doDeposit(wallet.address, AMOUNT); // Don't have more amount :(

  // execute withdraw from the address sender (in this case, the owner wallet)
  await logger.info("Requesting Withdraw...");
  await reqWithdraw(wallet.address, WITHDRAW_AMOUNT);

  // get and print WAVAX balance after executing
  wavaxBalance = await token.balanceOf(wallet.address);
  await logger.info(
    `Our amount of WAVAX in the wallet after execution is ${wavaxBalance}`
  );
};

// TODO(nb): implement timer for execuitng doRecursion() automatically
main();

// ## UNUSED METHODS: they are for checking things:
// method for claiming rewards tokens from aave to the strategy contract
const claimRewardToken = async () => {
  // get owner wallet
  const [wallet] = await ethers.getSigners();

  // get strategy contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  try {
    // claim the rewards from aave
    logger.info("Claiming rewards ...");
    const tx = await strategy.claimRewards({
      from: wallet.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();
    logger.info(`rewards claimed`);
  } catch (err) {
    console.error(err);
  }
};

// method for watching gas price from chainlink data feed (for testing)
const watchGasPrice = async () => {
  // get strategy contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = (await strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  )) as StrategyRecursiveFarming;

  try {
    // execute method that returns gas price from the strategy contract
    const gasPrice = await strategy.gasPrice();

    // print it
    logger.info(BigNumber.from(gasPrice));
  } catch (err) {
    console.error(err);
  }
};

// watchGasPrice();
// claimRewardToken();
