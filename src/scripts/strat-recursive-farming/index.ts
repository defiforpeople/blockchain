import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
// eslint-disable-next-line camelcase
import {
  // eslint-disable-next-line camelcase
  IERC20__factory,
  IERC20,
  StrategyRecursiveFarming,
} from "../../../typechain";
import { getWeth } from "../../../utils/helpers/get-weth";
import { deposit } from "./deposit";
import { reqWithdraw } from "./req-withdraw";
const logger = require("pino")();

// defined constants
const { WRAPPED_NATIVE_TOKEN_ADDRESS, CONTRACT_ADDRESS } = process.env;
const AMOUNT = BigNumber.from("1000000000");

// function for managing the execution flow of the other functions
const main = async () => {
  // get the owner wallet
  const [wallet] = await ethers.getSigners();

  // get the strategy contract
  const strategyContract = await ethers.getContractFactory(
    "StrategyRecursiveFarming"
  );
  const strategy = strategyContract.attach(
    `${CONTRACT_ADDRESS}`
  ) as StrategyRecursiveFarming;

  // get the ERC20 native token (WAVAX in this case)
  const token = (await ethers.getContractAt(
    IERC20__factory.abi,
    `${WRAPPED_NATIVE_TOKEN_ADDRESS}`
  )) as IERC20;

  // get and print WAVAX balance before executing
  let wavaxBalance = await token.balanceOf(wallet.address);
  logger.info(
    `Our amount of WAVAX in the wallet before execution is ${wavaxBalance}`
  );

  // if we don't have enough WAVAX in the wallet, we'll wrapp it from our AVAX
  if (wavaxBalance < AMOUNT) {
    logger.info("Getting WAVAX...");
    await getWeth(wallet.address, AMOUNT.sub(wavaxBalance));
    logger.info(
      `WAVAX tx completed, our amount is: ${token.balanceOf(wallet.address)}`
    );
  }

  logger.info("Doing Deposit...");
  await deposit(wallet.address, AMOUNT);

  const quotaQty = await strategy.quotasPerAddress();
  logger.info(`The actual quota is ${quotaQty}`);

  // execute withdraw from the address sender (in this case, the owner wallet)
  logger.info("Requesting Withdraw...");
  await reqWithdraw(wallet.address);

  const apy = await strategy.getAPY();
  logger.info(`The actual APY is ${apy}`);

  // get and print WAVAX balance after executing
  wavaxBalance = await token.balanceOf(wallet.address);
  logger.info(
    `Our amount of WAVAX in the wallet after execution is ${wavaxBalance}`
  );
};

main();
