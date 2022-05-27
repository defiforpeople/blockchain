import { sleep, day } from "../../../utils/helpers/sleep";
import { claimRewardToken } from "../recursive-farming/claimRewards";
const logger = require("pino")();

(async () => {
  while (true) {
    const sleepInterval = 1;

    await claimRewardToken();

    logger.info(`Waiting ${sleepInterval} minutes`);
    await sleep(sleepInterval * day);
  }
})();
