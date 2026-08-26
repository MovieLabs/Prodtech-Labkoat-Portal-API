# Snapshots

Point-in-time exports kept as evidence, not as data anything reads.

## `omc-controlled-values-2026-08-24.*`

What `view:omc-controlled-values` published on the day its 33 collections and the view itself were
deleted. That arrangement was built by `migrate/buildOmcModel.js` from the OMC graph and was a
parallel copy of terms the Media Creation arrangement already held — the two shared 104 terms and
kept their own, independent shapes.

Three formats, because they answer different questions:

| File | Holds |
|---|---|
| `.csv` | one row per term: dotted name, definition, status, the collection it sat in |
| `.json` | the published document, nested |
| `.internal.json` | every placement with its full ancestor path — the only one that records the arrangement itself |

**This is what a rebuilt controlled-values view is checked against.** 184 of the 288 terms were
placed nowhere else, so after the deletion they are unplaced; all 184 kept their `omcToken`, which
lives on the term and not on any collection. What the deletion did remove is the record of *which
schema table* each value belonged to, and that record is here.
