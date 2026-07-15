# Deals

One JSON file per property: `YYYY-MM-DD-<address-slug>.json`.

Each file is a ready-to-import deal block — paste it into **Saved Deals → import** in the app.
See [../INTAKE.md](../INTAKE.md) for the format and the two-pass process.

Committing deals here is what keeps them versioned and backed up. The app itself stores saved
deals in one browser's `localStorage` (`rf-deals`) — per-device, and gone if browsing data is
cleared. These files are the durable copy.

Each deal is normally committed twice: once at `"stage": "pre-walk"` (before driving out) and
again at `"stage": "post-walk"` (after the walk-through). The git diff between those two commits
is the record of what walking the property actually changed.
