import { expect, use } from "chai";
import { Contract, BigNumber, Signer } from "ethers";
import {
  deployContract,
  deployMockContract,
  MockProvider,
  solidity,
} from "ethereum-waffle";
import TestingAavePool from "../../build/TestingAavePool.json";
import IPoolTest from "../../build/IPoolTest.json";

use(solidity);

describe("TestingAavePool", () => {
  // beforeEach(async () => {
  let TestingAaveContract: Contract;
  let IPoolTestInterface: Contract;
  const setup = async () => {
    const [wallet] = new MockProvider().getWallets();

    const Mock = [
      BigNumber.from("6653617439"),
      BigNumber.from("705406114"),
      BigNumber.from("4556939919"),
      BigNumber.from("8182"),
      BigNumber.from("7909"),
      BigNumber.from("7717525664939161557"),
    ];

    IPoolTestInterface = await deployMockContract(wallet, IPoolTest.abi);

    TestingAaveContract = await deployContract(wallet, TestingAavePool, [
      IPoolTestInterface.address,
    ]);
    // });
    return { wallet, IPoolTestInterface, TestingAaveContract, Mock };
  };

  it("Calls user info with 'getUser' in 'TestingAaveContract' contract", async () => {
    const { wallet, IPoolTestInterface, TestingAaveContract, Mock } =
      await setup();
    const IPoolResponse =
      await IPoolTestInterface.mock.getUserAccountData.returns(Mock);
    console.info("Response: ", IPoolResponse);
    console.log("Si ", TestingAaveContract.getUser(wallet.address));

    expect(TestingAaveContract.getUser(wallet.address).values).to.be.equal(
      IPoolResponse
    );
  });
});

// [
//   BigNumber { value: "6653617439" },
//   BigNumber { value: "705406114" },
//   BigNumber { value: "4556939919" },
//   BigNumber { value: "8182" },
//   BigNumber { value: "7909" },
//   BigNumber { value: "7717525664939161557" }
// ]
