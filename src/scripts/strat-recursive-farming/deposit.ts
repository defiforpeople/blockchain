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
const logger = require("pino")();

// defined constants
const { WRAPPED_NATIVE_TOKEN_ADDRESS, CONTRACT_ADDRESS } = process.env;
const GAS_LIMIT = 2074040;

// function for user to deposit in the smart contract and start strategy
export async function deposit(
  userAddr: string,
  amount: BigNumber
): Promise<void> {
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
  logger.info("Approving...");
  const tx = await token.approve(`${CONTRACT_ADDRESS}`, amount, {
    from: userAddr,
    gasLimit: GAS_LIMIT,
  });
  await tx.wait();
  logger.info("Approved...");

  // execute deposit() in the strategy contract
  logger.info("Depositing...");
  const depositTx = await strategy.deposit(amount, {
    from: userAddr,
    gasLimit: GAS_LIMIT,
  });
  await depositTx.wait();
  logger.info("Deposited...");
}
