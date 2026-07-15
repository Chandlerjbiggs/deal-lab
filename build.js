#!/usr/bin/env node
/* Build: river-forged-deal-lab.jsx  ->  index.html
 *
 * The .jsx is the source of truth. index.html is the deployable that
 * GitHub Pages serves from main. This script regenerates index.html by
 * embedding the JSX in the HTML shell below.
 *
 * Run:  node build.js        (rewrites index.html)
 *       node build.js --check  (verify index.html is up to date; changes nothing)
 *
 * Every transform below asserts it actually matched. If the .jsx changes
 * shape and a transform stops matching, the build FAILS LOUDLY rather than
 * emitting a broken index.html to the live site.
 */

const fs = require("fs");
const path = require("path");

const DIR = __dirname;
const SRC = path.join(DIR, "river-forged-deal-lab.jsx");
const OUT = path.join(DIR, "index.html");

const HEAD = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Chandler Biggs Flip Analyzer</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>&#128296;</text></svg>">
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"></script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/7.23.5/babel.min.js"></script>
<style>body{margin:0}</style>
</head>
<body>
<div id="root"></div>
<script>
const storageShim = {
  async get(key) { const v = localStorage.getItem(key); return v === null ? null : { key, value: v }; },
  async set(key, value) { localStorage.setItem(key, value); return { key, value }; },
  async delete(key) { localStorage.removeItem(key); return { key, deleted: true }; },
};
</script>
<script type="text/babel" data-presets="react">
`;

// No trailing newline after </html> — matches the hand-built index.html
// that is already live, so the first build is a byte-for-byte no-op.
const TAIL = `
ReactDOM.createRoot(document.getElementById("root")).render(<App />);
</script>
</body>
</html>`;

function fail(msg) {
  console.error("\nBUILD FAILED: " + msg);
  console.error("index.html was NOT changed.\n");
  process.exit(1);
}

// --- read source ---
if (!fs.existsSync(SRC)) fail("can't find " + path.basename(SRC));
let js = fs.readFileSync(SRC, "utf8").replace(/\r\n/g, "\n");

// --- 1. React import -> UMD globals ---
const IMPORT_RE = /^import React,\s*\{([^}]*)\}\s*from\s*["']react["'];?\n/;
if (!IMPORT_RE.test(js)) fail("expected the React import on line 1 of the .jsx; didn't find it.");
js = js.replace(IMPORT_RE, (_m, hooks) => `const {${hooks}} = React;\n`);

// --- 2. unwrap `export default` (Babel standalone has no module system) ---
if (!/^export default function App\(\)/m.test(js)) fail("expected `export default function App()` in the .jsx; didn't find it.");
js = js.replace(/^export default function App\(\)/m, "function App()");
if (/^\s*(export|import)\s/m.test(js)) fail("leftover import/export in the .jsx — the browser build can't use modules. Remove it.");

// --- 3. artifact storage API -> localStorage shim ---
const storageHits = (js.match(/window\.storage/g) || []).length;
if (storageHits === 0) fail("no `window.storage` calls found — the saved-deals code may have changed shape. Check before shipping.");
js = js.replace(/window\.storage/g, "storageShim");

const html = HEAD + js + TAIL;

// --- 4. sanity checks on the output ---
if (!html.includes("rf-deals")) fail("the `rf-deals` localStorage key is missing from the output — saved deals would be lost.");
if (html.includes("window.storage")) fail("a `window.storage` reference survived the transform.");

// --- --check mode: verify, don't write ---
if (process.argv.includes("--check")) {
  const current = fs.existsSync(OUT) ? fs.readFileSync(OUT, "utf8").replace(/\r\n/g, "\n") : "";
  if (current === html) {
    console.log("index.html is up to date with the .jsx.");
    process.exit(0);
  }
  console.error("\nindex.html is OUT OF DATE — it doesn't match river-forged-deal-lab.jsx.");
  console.error("Run:  node build.js\n");
  process.exit(1);
}

fs.writeFileSync(OUT, html);
const kb = (Buffer.byteLength(html) / 1024).toFixed(1);
console.log(`Built index.html (${kb} KB) from river-forged-deal-lab.jsx`);
console.log(`  ${storageHits} storage call${storageHits === 1 ? "" : "s"} shimmed to localStorage`);
console.log("\nNext:  git add -A && git commit -m \"your message\" && git push");
