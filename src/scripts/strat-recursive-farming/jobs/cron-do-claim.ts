import { sleep, day } from "../../../utils/helpers/sleep";
import { claimRewardToken } from "../claimRewards";
const logger = require("pino")();

// execute claimRewardToken() every 1 day
(async () => {
  while (true) {
    const sleepInterval = 1;

    await claimRewardToken();

    logger.info(`Waiting ${sleepInterval} days`);
    await sleep(sleepInterval * day);
  }
})();
