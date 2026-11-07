// Legacy entry point: publish only immutable KarmaanEO tags to the fork.
import { pushRelease } from "./karmaaneo-release.mjs";
console.log(pushRelease(process.cwd()));
