import { expect, use } from "chai";
import { Contract, BigNumber } from "ethers";
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
  let TestingAaveContract: Contract;
  let IPoolTestInterface: Contract;

  const setup = async () => {
    const [wallet] = new MockProvider().getWallets();

    const Mock = [
      6658762878,
      705414466,
      4561001094,
      8182,
      7909,
      BigNumber.from("7723402410349775844"),
    ];

    IPoolTestInterface = await deployMockContract(wallet, IPoolTest.abi);
    TestingAaveContract = await deployContract(wallet, TestingAavePool, [
      IPoolTestInterface.address,
    ]);

    return { wallet, IPoolTestInterface, TestingAaveContract, Mock };
  };

  it("Calls user info with 'getUser' in 'TestingAaveContract' contract", async () => {
    const { wallet, IPoolTestInterface, TestingAaveContract, Mock } =
      await setup();

    await IPoolTestInterface.mock.getUserAccountData
      .withArgs(wallet.address)
      .returns(Mock[0], Mock[1], Mock[2], Mock[3], Mock[4], Mock[5]);

    const contractResponse = await TestingAaveContract.getUser(wallet.address);
    console.log("Response: ", contractResponse[0]);

    expect(await contractResponse[0]).to.be.equal(Mock[0]);
    expect(await contractResponse[1]).to.be.equal(Mock[1]);
    expect(await contractResponse[2]).to.be.equal(Mock[2]);
    expect(await contractResponse[3]).to.be.equal(Mock[3]);
    expect(await contractResponse[4]).to.be.equal(Mock[4]);
    expect(await contractResponse[5]).to.be.equal(Mock[5]);
  });
});
