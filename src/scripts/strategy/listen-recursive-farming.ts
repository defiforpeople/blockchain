import { ethers } from "hardhat";
import "@nomiclabs/hardhat-ethers";
import { BigNumber } from "ethers";
// eslint-disable-next-line camelcase
import {
  // eslint-disable-next-line camelcase
  IERC20__factory,
  IERC20,
  StrategyRecursiveFarming,
} from "../../typechain";
const logger = require("pino")();

// amount swapped: 0.0001 ether

const { WETH_ADDRESS } = process.env;
const CONTRACT_ADDRESS = "0x1586a098746EeC3e1210ca06a582f550a7dA431C";
const GAS_LIMIT = 2074040;
const AMOUNT = 10000000000;
const [WALLET] = await ethers.getSigners();

const STRATEGY_CONTRACT = await ethers.getContractFactory(
  "StrategyRecursiveFarming"
);

const STRATEGY = (await STRATEGY_CONTRACT.attach(
  CONTRACT_ADDRESS
)) as StrategyRecursiveFarming;

// define instance of erc20 token
const token = (await ethers.getContractAt(
  IERC20__factory.abi,
  `${WETH_ADDRESS}`
)) as IERC20;

const doDeposit = async (): Promise<void> => {
  // make approve tx to erc20 token contract and wait confirmation
  await logger.info("Approving...");
  const tx = await token.approve(CONTRACT_ADDRESS, AMOUNT, {
    from: WALLET.address,
    gasLimit: GAS_LIMIT,
  });
  tx.wait();
  await logger.info("Approved...");

  await logger.info("Supplying...");
  const depositTx = await STRATEGY.deposit(AMOUNT, {
    from: WALLET.address,
    gasLimit: GAS_LIMIT,
  });
  depositTx.wait();
  await logger.info("Supplied...");
  console.log(depositTx);

  doRecursion();
};

const doRecursion = async (): Promise<void> => {
  try {
    const DONE = 2;

    if ((await STRATEGY.viewStatus()) === DONE) {
      return;
    }

    if (
      (await STRATEGY.gasNeeded({
        from: WALLET.address,
        gasLimit: GAS_LIMIT,
      })) > BigNumber.from("0")
    ) {
      // TODO(nb): method for adding gas to the wallet owner
      return;
    }

    const tx = await STRATEGY.doRecursion({
      from: WALLET.address,
      gasLimit: GAS_LIMIT,
    });
    await tx.wait();
  } catch (err) {
    logger.error(err);
  }
};

const reqWithdraw = async (
  userAddr: string,
  amount: BigNumber
): Promise<void> => {
  const reqTx = await STRATEGY.requestWithdraw(amount, {
    from: userAddr,
    gasLimit: GAS_LIMIT,
  });
  await reqTx.wait();
  console.log(reqTx);

  // TODO(nb): try to do it with events
  const withdrawTx = await STRATEGY._withdraw(userAddr, amount, {
    from: WALLET.address,
    // TODO(nb): question: is possible to sign this tx with the user addres too?
    gasLimit: GAS_LIMIT,
  });
  await withdrawTx.wait();
  console.log(withdrawTx);
};

// We´ll cover the gas of the off-chain and sc interactions
const main = async () => {
  await doDeposit(); // Don't have more amount :(

  await reqWithdraw(WALLET.address, BigNumber.from("100"));
};

main();

// strategy.on(
//   "Withdraw",
//   async (userAddr: string, amount: BigNumber): Promise<void> => {
//     try {
//       const tx = await strategy.performUpkeep("", {
//         from: strategy.address,
//         gasLimit: GAS_LIMIT,
//       });
//       await tx.wait();
//     } catch (err) {
//       logger.error(err);
//     }
//   }
// );

// strategy.on("Borrow", async (ev: any): Promise<void> => {
//   try {
//     const supplyTx = await strategy.supply({
//       from: strategy.address,
//       gasLimit: GAS_LIMIT,
//     });
//     await supplyTx.wait();
//   } catch (err) {
//     logger.error(err);
//   }
// });
// strategy.on("Deposit", async (ev: any): Promise<void> => {
//   try {
//     const borrowTx = await strategy.borrow();
//     await borrowTx.wait();
//   } catch (err) {
//     logger.error(err);
//   }
// });
// };

// strategy.on("Deposit", async (ev: any): Promise<void> => {
//   console.log("Listening event");
//   try {
//     console.log("Performing keeper: ");
//     const borrowTx = await strategy.performUpkeep("", {
//       from: wallet.address,
//       gasLimit: GAS_LIMIT,
//     });
//     await borrowTx.wait();
//   } catch (err) {
//     logger.error(err);
//   }
// });
