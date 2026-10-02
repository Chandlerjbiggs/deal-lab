#!/usr/bin/env node
/* Run a deal file through the real app and report the app's numbers.
 *
 * INTAKE.md's rule: the app's iterative MAO solve is the number; arithmetic
 * done in chat is not. This script keeps that rule while skipping the manual
 * paste. It opens index.html in headless Chromium, pastes the deal JSON into
 * Saved Deals → Import (the same path Chandler uses), and reads back what the
 * app computed. It never re-implements any math.
 *
 * Run:  node run-deal.js deals/2026-10-02-1234-main-st.json
 *       node run-deal.js <file> --json    (machine-readable output)
 *       node run-deal.js <file> --write   (also store the result in the file as "appResult",
 *                                          so the pre-walk → post-walk git diff shows the MAO move)
 *
 * Needs Playwright + Chromium (present in Claude Code cloud sessions). The
 * CDN scripts index.html loads (React, ReactDOM, Babel) are served from the
 * same pinned versions on npm, cached in ~/.cache/deal-lab-vendor, so this
 * works where cdnjs is blocked and is identical to the live page.
 */

const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const DIR = __dirname;
const HTML = path.join(DIR, "index.html");
const VENDOR = path.join(os.homedir(), ".cache", "deal-lab-vendor");
// cdnjs library name -> npm package that publishes the same files
const CDN_TO_NPM = { "react": "react", "react-dom": "react-dom", "babel-standalone": "@babel/standalone" };

function fail(msg) { console.error("\nRUN FAILED: " + msg + "\n"); process.exit(1); }

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--"));
const asJson = args.includes("--json"), write = args.includes("--write");
if (!file) fail("usage: node run-deal.js <deal.json> [--json] [--write]");
if (!fs.existsSync(file)) fail("no such file: " + file);

let block;
try { block = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { fail("not valid JSON: " + e.message); }
if (!block.deal) fail('missing "deal" — the app would reject this import.');

// index.html must match the jsx, or we'd be reporting numbers from stale code.
try { execFileSync(process.execPath, [path.join(DIR, "build.js"), "--check"], { stdio: "pipe" }); }
catch { fail("index.html is out of date with the jsx. Run `node build.js` first."); }

function loadPlaywright() {
  try { return require("playwright"); } catch {}
  try {
    const root = execFileSync("npm", ["root", "-g"], { encoding: "utf8" }).trim();
    return require(path.join(root, "playwright"));
  } catch { fail("Playwright isn't installed. In a cloud session it is preinstalled; locally: npm i -g playwright"); }
}

/* Fetch one CDN file from the npm tarball of the same package+version. */
function vendorFile(lib, version, rel) {
  const pkg = CDN_TO_NPM[lib];
  if (!pkg) fail(`index.html loads ${lib} from cdnjs, which run-deal.js doesn't know how to vendor. Add it to CDN_TO_NPM.`);
  const dir = path.join(VENDOR, `${lib}@${version}`);
  const target = path.join(dir, "package", rel);
  if (!fs.existsSync(target)) {
    fs.mkdirSync(dir, { recursive: true });
    const tgz = execFileSync("npm", ["pack", `${pkg}@${version}`, "--silent", "--pack-destination", dir], { encoding: "utf8" }).trim().split("\n").pop();
    execFileSync("tar", ["-xzf", path.join(dir, tgz), "-C", dir]);
    if (!fs.existsSync(target)) fail(`${pkg}@${version} has no ${rel}`);
  }
  return fs.readFileSync(target);
}

(async () => {
  const { chromium } = loadPlaywright();
  const browser = await chromium.launch();
  const page = await browser.newPage(); // fresh profile: no saved deals touched, nothing persisted
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith("file:")) return route.continue();
    const m = url.match(/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/([^/]+)\/([^/]+)\/(.+)$/);
    if (m) return route.fulfill({ body: vendorFile(m[1], m[2], m[3]), contentType: "application/javascript" });
    return route.abort(); // web fonts etc. — cosmetic, not needed for numbers
  });

  try {
    await page.goto("file://" + HTML);
    await page.getByRole("button", { name: /^Saved Deals/ }).click({ timeout: 30000 });
    await page.locator("textarea").fill(JSON.stringify(block));
    await page.getByRole("button", { name: "Import deal" }).click();
    await page.waitForFunction(() => window.dealLabResult && document.body.innerText.includes("Loaded \""), null, { timeout: 10000 })
      .catch(() => fail("the app didn't accept the import. Page says: " + errors.join("; ")));

    const r = await page.evaluate(() => JSON.parse(JSON.stringify(window.dealLabResult)));

    // Cross-check: the MAO we report must be the MAO the Review tab displays.
    await page.getByRole("button", { name: "Review", exact: true }).click();
    const shown = await page.locator("text=True iterative max").innerText();
    const m = r.calc.mao, fmtMao = (m < 0 ? "-$" : "$") + Math.abs(m).toLocaleString("en-US", { maximumFractionDigits: 0 });
    if (!shown.includes(fmtMao)) fail(`MAO mismatch: hook says ${fmtMao}, Review tab says "${shown}"`);

    report(r);
  } finally { await browser.close(); }
})().catch((e) => fail(e.message));

function report(r) {
  const { calc, est, deal } = r;
  const warnings = [];
  if (deal.repairMode !== "detailed") warnings.push(`repairMode is "${deal.repairMode}" — repairs bypass the estimator. INTAKE.md requires "detailed".`);
  if (r.noScope) warnings.push("Detailed mode with an EMPTY estimator: repairs priced at $0. These numbers are meaningless.");
  // Missing fields fall back to DEFAULT_DEAL, which is NOT the RF preset (e.g. 2 points, full-term
  // interest, 20%-of-ARV profit). Flag any money-affecting field the file left out, and any that
  // differs from the RF preset — sometimes on purpose (3% buying under $75K), but it should be seen.
  const MONEY = ["buyMode", "buyPct", "renoMonths", "salesMonths", "holdMode", "holdPerMonth", "sellMode", "sellPct",
    "finStrategy", "loanBasis", "ltvP", "ltvR", "rate", "finMonthsAuto", "points", "otherPct", "interestSchedule", "profitMode", "profitLump"];
  const missing = MONEY.filter((k) => !(k in block.deal));
  if (missing.length) warnings.push(`Not in the deal file, so the app used its generic defaults (NOT the RF preset): ` +
    missing.map((k) => `${k}=${JSON.stringify(deal[k])}`).join(", ") + ". Set them explicitly.");
  const offPreset = MONEY.filter((k) => k in r.rfPreset && String(deal[k]) !== String(r.rfPreset[k]))
    .map((k) => `${k} ${JSON.stringify(deal[k])} (preset ${JSON.stringify(r.rfPreset[k])})`);
  const zero = r.activeRows.filter((x) => Number(x.labor) + Number(x.material) === 0);
  if (zero.length) warnings.push(`Line items with a quantity but $0 price (check the name matches the library): ${zero.map((x) => x.desc).join("; ")}`);
  const custom = r.activeRows.filter((x) => x.custom).map((x) => x.desc);

  const result = {
    ranAt: new Date().toISOString(),
    verdict: calc.verdict,
    mao: Math.round(calc.mao),
    mppStatic: Math.round(calc.mppStatic),
    purchase: calc.purchase, arv: calc.arv, repair: Math.round(calc.repair),
    profit: Math.round(calc.profit), desiredProfit: Math.round(calc.desired),
    baseTarget: Math.round(calc.baseTarget), stormFloor: calc.stormFloor,
    stress: calc.stress.map((s) => ({ name: s.name, profit: Math.round(s.profit), floor: Math.round(s.floor), passes: s.passes })),
    costs: { buying: Math.round(calc.buying), holding: Math.round(calc.holding), selling: Math.round(calc.selling), financing: Math.round(calc.financing) },
    cashNeeded: Math.round(calc.cashNeeded), holdMonths: calc.holdMonths, rehabDays: calc.rehabDays, suggestedRenoMonths: calc.suggReno,
    repairByTab: Object.fromEntries(Object.entries(est.byTab).filter(([, v]) => v.labor + v.material > 0)
      .map(([t, v]) => [t, Math.round(v.labor + v.material)])),
    repairAdders: Math.round(est.adderAmt), lineItems: est.count, customLineItems: custom,
    offPreset, warnings,
  };

  if (write) {
    block.appResult = result;
    fs.writeFileSync(file, JSON.stringify(block, null, 2) + "\n");
  }
  if (asJson) { console.log(JSON.stringify(result, null, 2)); return; }

  const $ = (n) => (n < 0 ? "-$" : "$") + Math.abs(Math.round(n)).toLocaleString("en-US");
  const V = { clears: "CLEARS FLOOR", thin: "THIN — STORM RISK", below: "BELOW FLOOR" }[calc.verdict];
  const L = (k, v) => console.log("  " + k.padEnd(30) + v);
  console.log(`\n${block.name || deal.address || file}${block.stage ? `  [${block.stage}]` : ""}`);
  console.log("=".repeat(60));
  // Warnings first: a verdict computed on bad inputs must not be read before its caveats.
  if (warnings.length) { warnings.forEach((w) => console.log("  ! " + w)); console.log(); }
  L("Verdict", V);
  L("Max purchase (app MAO)", $(calc.mao) + `  @ ${$(calc.desired)} desired profit`);
  L("FlipperForce static MPP", $(calc.mppStatic));
  console.log();
  L("ARV", $(calc.arv));
  L("Purchase (as entered)", $(calc.purchase));
  L("Repairs", `${$(calc.repair)}  (${est.count} line items, ${$(est.adderAmt)} adders)`);
  for (const [t, v] of Object.entries(result.repairByTab)) L("    " + t, $(v));
  L("Buying / Holding", `${$(calc.buying)} / ${$(calc.holding)}`);
  L("Selling / Financing", `${$(calc.selling)} / ${$(calc.financing)}`);
  L("Profit at entered purchase", $(calc.profit));
  L("Cash needed", $(calc.cashNeeded));
  L("Timeline", `${calc.holdMonths} mo hold; rehab ≈ ${calc.rehabDays} work days (suggest ${calc.suggReno} mo reno)`);
  console.log("\n  Stress test (at entered purchase):");
  for (const s of calc.stress) console.log(`    ${s.passes ? "✓" : "✕"} ${s.name.padEnd(28)}${$(s.profit).padStart(11)}   floor ${$(s.floor)}`);
  if (offPreset.length) console.log(`\n  Differs from RF preset: ${offPreset.join("; ")}`);
  if (custom.length) console.log(`\n  Custom (non-library) items: ${custom.join("; ")}`);
  if (write) console.log(`\n  Saved to ${file} as "appResult".`);
  console.log();
}
