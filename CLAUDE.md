# River Forged Deal Lab

Flip analyzer + repair estimator for River Forged LLC (Chandler Biggs, Grand Rapids MI house flipper).
Replaces FlipperForce ($30/mo). Live at https://chandlerjbiggs.github.io/deal-lab/

## Architecture
- **Single-source app.** `river-forged-deal-lab.jsx` is the source of truth — one React component, no build system.
- **`index.html` is the deployable** — the same JSX embedded in an HTML shell that loads React 18 UMD + Babel standalone from cdnjs and transpiles in-browser. A `storageShim` maps the artifact `window.storage` API to `localStorage`.
- **Build = regenerate index.html from the jsx**: strip the React import (use globals), unwrap `export default`, replace `window.storage` → `storageShim`, embed in the HTML template (see current index.html for the exact shell). Keep this process or replace with a proper Vite build — either is fine, but the deployed site must stay a static GitHub Pages site.
- **Deploy**: commit `index.html` to main → GitHub Pages auto-deploys.
- Saved deals live in each browser's localStorage under key `rf-deals`. Never break that key or users lose their deals.

## Math invariants — do not change without Chandler's sign-off
1. **Profit** = ARV − Purchase − Repair − Buying − Holding − Selling − Financing (FlipperForce-compatible; verified to the dollar against FF).
2. **Floor logic**: base target = max($50K, 20% of ARV) at base case. Storm floor = $35K under "perfect storm" (ARV −5%, rehab +15%, timeline +2mo), rising to $50K when all-in (purchase+rehab) > $250K. Verdict: clears / thin (base passes, storm fails) / below.
3. **MAO** is solved iteratively (buying % and financing recalc at the offer price). The Review tab also shows FlipperForce's static MPP for cross-checking against their reports.
4. **Financing**: interest-only monthly = loan × rate/12. "Holdback" schedule = purchase portion accrues full term; rehab portion accrues at reno/2 + sales months.
5. **Timeline rule**: every $1K rehab ≈ 1 work day, 21 work days/month.
6. **RF preset**: 2% buying (3% under $75K purchase), 6% selling, $450/mo holding, 100% LTV purchase+repairs @ 12%, 0 points, holdback, $50K desired profit.

## Pricing calibration (from real flip close-outs — 312 Beverly St, Sturgis)
The estimator library labor prices reflect Chandler's crew model: general laborers ($30–35/hr GR) do demo, paint, trim, doors, fixtures, kitchen installs, small framing, handyman work in-house. Hired-out trades keep market pricing: concrete, roofing, windows, flooring/carpet, plumbing/electrical/HVAC rough-in, full siding, masonry rebuilds. Calibrated numbers already in the library: windows $375/ea installed, concrete $6.50–8/SF, LVP $3.35/SF all-in, carpet $2.50/SF, kitchen economy $8,500, PM fee line $7,500 under General Conditions. Don't revert these to FlipperForce defaults.

## Deal import/export schema (Saved Deals tab)
`{ name, deal: {address, arv, sqft, purchase, repairMode, ...}, adders: {location, contingency, ohp, laborTax, matTax}, estRows: [{tab, cat, desc, unit, qty, labor, material, custom?}] }`
estRows matching library (tab, cat, desc) override qty/prices; non-matching rows append as custom. Claude (chat) generates these blocks after analyzing wholesaler deals — never break backward compatibility with this schema.

## Roadmap (Chandler's priorities)
1. Persistent "My Pricing" layer — editable line-item prices that persist and apply to every deal (currently hardcoded in LIB).
2. Scope templates — one-click "RF Cosmetic Flip" / "Full Gut" / "Systems + Cosmetic" that pre-fill estimator quantities from sqft/beds/baths.
3. Mobile walk-through mode — room-by-room estimator flow, big tap targets, for on-site use.
4. Item search box in the estimator.
5. Auto-quantities from property specs (paint/flooring SF, door counts from beds).
6. Scope-of-work export per trade (contractor-facing, prices optional).
7. Cross-device deal sync (localStorage is per-device today; import/export JSON is the current bridge).

## Style
FlipperForce-familiar palette: navy #2C3E50, blue #2E86DE, green #2FB380, red #C0392B, light-blue table headers #DEEDF7. Keep the verdict stamp and live ledger prominent. Direct, no-filler UI copy.
