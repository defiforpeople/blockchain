import { ethers } from "hardhat";
import { BigNumber } from "ethers";
import "@nomiclabs/hardhat-ethers";
// eslint-disable-next-line camelcase
import {
  StrategyRecursiveFarming,
  // eslint-disable-next-line camelcase
  LinkTokenInterface__factory,
  LinkTokenInterface,
} from "../../typechain";
import { linkFund } from "../../utils/helpers/link-fund";
const logger = require("pino")();

// defined constants
const { CONTRACT_ADDRESS, LINK_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// TODO(nb): implement cron jobs for execuitng doRecursion() automatically
// method for executing recursion based on the contract status (supply or borrow)
export async function doRecursion(): Promise<void> {
  // get the owner wallet
  const [wallet] = await ethers.getSigners();

  // get the contract
  const strategyCONTRACT = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyCONTRACT.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

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

    // // ## The following was commented because something fails:
    // await logger.info("checking if the contract has enough LINK");
    // const linkNeeded = await strategy.linkNeeded({
    //   // FAILS
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

    // // TODO(nb): question: don't know if calculating the owner wallet gas is necessary
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
    // // ##

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
}
