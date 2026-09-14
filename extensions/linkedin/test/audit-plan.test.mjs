import test from "node:test";
import assert from "node:assert/strict";
import { loadCore } from "../../../test/helpers/load-classic.mjs";
import { plannedLoads, checksRedirects } from "../audit/plan.mjs";
import { BUDGETS } from "../../../scripts/audit-budget.mjs";

const core = loadCore(new URL("../src/", import.meta.url)).PeaceBeStill;

// Totals counted from real live:linkedin runs (2026-09-10 and 2026-09-14), by
// its own counter -- which did not count the load that opens the LinkedIn tab,
// so each run really made one more, and that one is added here. The
// estimate must never fall short of them -- a run that claims too few is
// stopped halfway by its own real total -- and should not overshoot by more
// than the spare it allows.
const MEASURED = [
  [["/messaging/"], [2]],
  [["/jobs/", "/in/me/", "/messaging/"], [6]],
  [["/feed/", "/mynetwork/grow/"], [11]],
  [["/feed/", "/mynetwork/grow/", "/jobs/", "/in/me/", "/messaging/"], [17, 18]],
];

test("the loads a run claims cover what real runs have spent, without much to spare", () => {
  for (const [paths, seen] of MEASURED) {
    const planned = plannedLoads(paths, core);
    const most = Math.max(...seen) + 1; // the tab it opened LinkedIn in
    assert.ok(planned >= most, `${paths.join(" ")}: claims ${planned}, but a run spent ${most}`);
    const homes = paths.filter((path) => checksRedirects(path, core)).length;
    assert.ok(planned <= most + 1 + homes, `${paths.join(" ")}: claims ${planned}, far over the ${most} spent`);
  }
});

test("a full run of all five pages fits in one hour's LinkedIn budget, and no more than one", () => {
  const five = plannedLoads(MEASURED[3][0], core);
  assert.ok(five <= BUDGETS.linkedin.perHour, `${five} loads cannot start within ${BUDGETS.linkedin.perHour} an hour`);
  assert.ok(five * 2 > BUDGETS.linkedin.perHour, "two full runs an hour would be too many");
});

test("only the home page has its redirects checked", () => {
  assert.equal(checksRedirects("/feed/", core), true);
  assert.equal(checksRedirects("/", core), true);
  for (const path of ["/jobs/", "/mynetwork/grow/", "/in/me/", "/messaging/"]) assert.equal(checksRedirects(path, core), false, path);
});
