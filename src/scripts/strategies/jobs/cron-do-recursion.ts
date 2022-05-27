import { sleep, minute } from "../../../utils/helpers/sleep";
import { doRecursion } from "../recursive-farming/do-recursion";
const logger = require("pino")();

// defined constants
(async () => {
  while (true) {
    const sleepInterval = 5;

    await doRecursion();

    logger.info(`Waiting ${sleepInterval} minutes`);
    await sleep(sleepInterval * minute);
  }
})();
