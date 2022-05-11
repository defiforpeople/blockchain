import { expect, use } from "chai";
import { Contract, Wallet } from "ethers";
import { solidity } from "ethereum-waffle";
import { ethers } from "hardhat";

use(solidity);

describe("BasicToken", () => {
  let wallet: Wallet, walletTo: Wallet;
  let token: Contract;

  beforeEach(async () => {
    // prepare randoms ownerWallet
    wallet = ethers.Wallet.createRandom().connect(ethers.provider);
    walletTo = ethers.Wallet.createRandom().connect(ethers.provider);

    // send 1 eth from signer(0) to randoms wallets
    const signer = ethers.provider.getSigner(0);
    await signer.sendTransaction({
      to: wallet.address,
      value: ethers.utils.parseEther("1.0"),
    });
    await signer.sendTransaction({
      to: walletTo.address,
      value: ethers.utils.parseEther("1.0"),
    });

    const Token = await (
      await ethers.getContractFactory("BasicToken")
    ).connect(wallet);
    token = await Token.deploy(1000);
  });

  it("Assigns initial balance", async () => {
    expect(await token.balanceOf(wallet.address)).to.equal(1000);
  });

  it("Transfer adds amount to destination account", async () => {
    await token.transfer(walletTo.address, 7);
    expect(await token.balanceOf(walletTo.address)).to.equal(7);
  });

  it("Transfer emits event", async () => {
    await expect(token.transfer(walletTo.address, 7))
      .to.emit(token, "Transfer")
      .withArgs(wallet.address, walletTo.address, 7);
  });

  it("Can not transfer above the amount", async () => {
    await expect(token.transfer(walletTo.address, 1007)).to.be.reverted;
  });

  it("Can not transfer from empty account", async () => {
    const tokenFromOtherWallet = token.connect(walletTo);
    await expect(tokenFromOtherWallet.transfer(wallet.address, 1)).to.be
      .reverted;
  });
});
