import { ethers } from "hardhat";
import { IPool } from "@aave";
export default async function main(
  aavePoolAddress: string,
  userAddress: string
) {
  const aavePool = await ethers.getContractAt(IPool, aavePoolAddress);
}
ethers.getContractAtFromArtifact();
main(
  "0xE039BdF1d874d27338e09B55CB09879Dedca52D8",
  "0x57ac4E23aE911Cb3aEDAfE9ABb8E68a68F7CC463"
).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
