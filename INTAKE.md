# Deal Intake — Chandler's process

Two passes per property. Pass 1 happens before he drives out; pass 2 after he walks it.
The point of the split is that pass 1 is cheap and wrong, pass 2 is expensive and right —
and the diff between them is the useful artifact.

Chandler is not a developer. Give him numbers and scope, not implementation talk.

---

## Pass 1 — Pre-walk (wholesaler email + photos → rough purchase price)

**Goal:** a purchase price good enough to send the wholesaler, to decide whether the
property is worth driving to. Speed matters more than precision here.

**Inputs**
- The wholesaler's email — usually in Gmail (`chandlerjbiggs@gmail.com`). Ask which thread;
  don't go searching the inbox unprompted.
- Photos — **Google Drive folder link**. Google Photos links are NOT readable (no connector).

**Steps**
1. Pull from the email: address, sqft, beds/baths, year built, asking price, their ARV claim
   and comps, and any disclosed issues. Treat the wholesaler's ARV as a claim, not a fact.
2. Look at every photo. Build scope only from what is **visible**.
3. Produce a deal block (see *Deal file format*) → Chandler imports it → **the app computes MAO**.
4. Write it to `deals/<slug>.json` with `"stage": "pre-walk"`.

**Rules**
- **Always deliver a full scope breakdown, never a bare repair total.** Every generated block must set
  `"repairMode": "detailed"` and include `estRows` covering the whole scope. Only `"detailed"` reads
  from the estimator — `"lump"` and `"psf"` bypass it entirely (`river-forged-deal-lab.jsx:358`), which
  produces a single unexplained number in Step 3 and an empty Repair Estimator tab. This has already
  bitten Chandler once. A repair number he cannot break down line by line is not usable: he cannot
  sanity-check it, cannot hand it to a contractor, and cannot adjust it after the walk.
  - Corollary: `"detailed"` with empty `estRows` silently prices repairs at **$0** and makes any deal
    look like a winner. If scope genuinely cannot be determined, say so — do not ship an empty block.
- **The app's MAO is the number. Chat arithmetic is not.** The MAO solve is iterative (buying %
  and financing recalc at the offer price) and is verified to the dollar against FlipperForce.
  Never hand Chandler a purchase price computed in conversation — build the block, let the app run it.
- **Screen on the storm floor, not the base case.** Photo-only scope is the highest-uncertainty
  moment in the whole process. A deal that clears at base but fails the storm floor is not worth
  a drive — that is exactly what the storm floor is for.
- **Photos cannot show** what actually blows up a rehab budget: behind walls, subfloor, sewer
  lines, panel capacity, roof decking, foundation, mold, or permit history. Do not price those at
  zero. Carry contingency and say plainly what you could not see.
- **Do not invent quantities.** If sqft is unknown, say so rather than guessing — a fabricated
  quantity priced against a calibrated library produces a confidently wrong number.
- List every assumption explicitly in `assumptions[]`. Pass 2 exists to kill these.

---

## Pass 2 — Post-walk (voice memo transcript + new photos → adjusted budget)

**Inputs**
- **A transcript, not audio.** Claude cannot play or transcribe audio files — this is a hard
  limitation, not a preference. Chandler records on iPhone; Voice Memos (iOS 18+) auto-transcribes
  and he pastes the raw text.
- Ask him for the transcript **raw and unedited**. Length is a feature. Asides, hedges, and
  rambling are scope signal — "back bedroom smells musty and the window's painted shut" is worth
  far more than "bedroom needs work." A summarized memo has had the useful part removed.
- Optional new photos (Drive).

**Steps**
1. Read the transcript as scope evidence. Flag anything implying a system, structural, or
   moisture issue — those are the budget killers and they rarely show up in listing photos.
2. Load the pass-1 `deals/<slug>.json` and adjust `estRows` against what he actually saw.
3. Save back to the **same file**, `"stage": "post-walk"`, keeping `name` identical so git shows a
   clean diff and the app overwrites rather than duplicates the saved deal.
4. **Report the diff**: what the walk changed versus the pre-walk block, line by line, and why.

**Why the diff matters:** over several flips it shows where photo-based estimates are consistently
wrong — which categories Chandler under-scopes from pictures. That pattern is worth money and it
only exists if pass 1 is committed before the walk. Commit pass 1 *before* driving out, always.

---

## Deal file format

The app's import schema, plus metadata. **Extra top-level keys are safe** — `importDeal` requires
only `deal`, and `loadDeal` reads only `name` / `deal` / `adders` / `estRows`, ignoring the rest
(`river-forged-deal-lab.jsx:459-485`; `saveDeal` already adds its own `savedAt`).

```json
{
  "name": "312 Beverly St, Sturgis",
  "stage": "pre-walk",
  "source": "wholesaler email 2026-07-15 / Drive photos",
  "assumptions": ["sqft from county record, not measured", "roof age unknown — carried full tear-off"],
  "unseen": ["subfloor", "panel capacity", "sewer line"],
  "deal": { "address": "...", "arv": 0, "sqft": 0, "purchase": 0, "repairMode": "detailed" },
  "adders": { "location": 0, "contingency": 0, "ohp": 0, "laborTax": 0, "matTax": 0 },
  "estRows": [{ "tab": "...", "cat": "...", "desc": "...", "unit": "...", "qty": 0, "labor": 0, "material": 0 }]
}
```

- `estRows` matching the library on (`tab`, `cat`, `desc`) override qty/prices; non-matching rows
  append as custom. Never break backward compatibility with this schema.
- Missing `deal` fields fall back to `DEFAULT_DEAL`, so partial blocks import fine.
- File naming: `deals/YYYY-MM-DD-<address-slug>.json`.
- Keep `name` stable between passes — it is the identity key the app saves/overwrites on.

## Why deals live in the repo

The app stores saved deals in `localStorage` under `rf-deals` — **per browser, per device, no
backup**, and wiped by clearing browsing data. Committing the JSON here makes deals versioned,
backed up, readable from any machine, and diffable across passes. It is the cheap stand-in for
roadmap item 7 (cross-device sync) and costs nothing to keep up.
