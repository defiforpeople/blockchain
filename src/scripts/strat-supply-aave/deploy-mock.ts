import { ethers } from "hardhat";
const logger = require("pino")();

(async () => {
  const mockSupplyFactory = await ethers.getContractFactory("MockSupplyAave");
  const mockSupply = await mockSupplyFactory.deploy();
  logger.info(`mockSupplyAddress: ${mockSupply.address}`);
})();
