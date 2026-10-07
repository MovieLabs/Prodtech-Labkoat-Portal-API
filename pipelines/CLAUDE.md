# CLAUDE.md

Guidance for Claude Code working in `pipelines/`.

> Labkoat-API's own `CLAUDE.md` (the service hosting these pipelines) and the parent
> `MovieLabs-POC/CLAUDE.md` (the OMC record, pipeline credentials) load alongside this file.

---

## What this is

The processing pipelines. Each reads a heterogeneous production source (PDFs, XML, spreadsheets,
a third-party API) and turns it into OMC-JSON. **This is code the service runs, not a service**:
Labkoat-API loads it in worker threads (`src/pipeline/runner.worker.js`).

**Until 2026-10-06 this was a separate repository, `Data-Pipeline`**, published as snapshot tags to
`MovieLabs/omc-data-pipeline` and consumed as a git dependency. That repository is retired. Its
history stops at 1.1.0, which is the code this directory was imported from (`d30014a`). The move
was made because the only consumer was this service, and every change needed a tag, a publish and
a lockfile bump, a step that was forgotten.

**`README.md` is the real documentation.** It covers the layer model, running a pipeline, writing a
new one, the Script-E source in detail, the OMC mapping and schema versions. Read it before changing
anything here. This file carries only what the README does not: the boundary, the rules, the traps.

---

## The boundary

It is kept apart from the service code on purpose, and ESLint enforces it in both directions
(`eslint.config.js`, the two `no-restricted-imports` blocks at the end):

- **The service reaches pipelines through two names only**, the `package.json` `imports` aliases:
  - `#pipelines` → `pipelines/index.js`, used by `runner.worker.js`
  - `#pipelines/catalog` → `catalog/index.js`, imported lazily by `pipeline-controller.js`. Not the
    root, which also exports `lib` and would pull ExcelJS into the gateway.

  A relative path into `pipelines/`, or any other `#pipelines/…` name, is a lint error.
- **A pipeline knows nothing of the service.** No imports from `src/`, `express` or `mlHelpers`.
  Inside `pipelines/`, use relative paths, never the alias.

What this buys: a pipeline can be deleted by deleting its source folder and its line in
`catalog/registry.js`, and nothing in the service changes.

---

## Commands

Run from the repository root:

```bash
npm test                            # pipeline tests (node --test over pipelines/test)
npm run lint                        # covers src, pipelines and app.js
npm run pipeline -- pipelines       # list the catalogue
npm run pipeline -- run --pipeline script-e --dir "../WWDOAT/sourceData/Script-E/Filming Day 1"
PIPELINE_FIXTURES=.. npm run pipeline -- validate --day 1
npm run verify:frameio
```

### Fixtures live outside the repository

The production sample data (`WWDOAT/`, about 364 MB) is real production material and is in no
repository. It sits at `MovieLabs-POC/WWDOAT/`. **`PIPELINE_FIXTURES` names the directory that
holds production folders**, not a production itself:

```bash
PIPELINE_FIXTURES=.. npm test
PIPELINE_FIXTURES=.. npm run pipeline -- omc --day 1,2,3,4
```

- **Without it**, the eight tests that read fixtures are *skipped*, saying why, and the seven that do
  not still run. CI never sets it, so CI runs only those seven. **A green CI run says nothing about
  the golden comparison**: run with fixtures locally before changing a pipeline's output.
- **`lib/paths.js` exports `fixturesRoot`** (null when unset). `dayPaths` and `omcPath`, which the
  `extract`/`validate`/`omc` commands use, throw a message naming the variable rather than guessing.
  `run --dir` takes a path relative to the current directory and does not use it.
- **The golden bundle (`WWDOAT/omc/`) is guarded by checksums, not by git.** It is in no
  repository, so `test/golden.sha256.json` records it and `golden.test.js` fails when it changes.
  `extract`, `validate` and `omc` write under `.scratchpad/pipeline/` by default; only
  `--write-fixtures` writes into the fixtures. To regenerate the golden on purpose: run `omc` with
  `--write-fixtures`, then `npm run fixtures:record`, and commit the manifest with the change that
  caused it.

---

## Architecture

Four layers, each usable on its own:

```
catalog/            the uniform way in. A registry of self-describing pipelines, and the
                    context through which they read. Knows no sources and no formats.
sources/<source>/   one adapter per supplier. Reads a delivery, emits tables in OMC
                    terminology, and declares its mapping as data. No OMC construction.
omc/                generic. Turns tables + declarative mappings into validated OMC
                    entities. Knows no sources.
lib/                xml, csv, pdf, tabular, paths, http. Knows neither.
```

The interim tabular format is the spine, not a side-output: a source produces it and the OMC layer
consumes it. It already uses OMC terminology, so a second source maps into the same shape rather than
into a Script-E-shaped one.

**Three sources exist** (`frameio`, `scriptE`, `yamdu`), registered in `catalog/registry.js`.

**A new source needs a parser that emits tables and a mapping that is data. It needs no OMC code.**
See `sources/scriptE/omcMapping.js` for what a mapping looks like.

---

## Hard rules

**Never restate the OMC schema.** Shapes, edge paths, inverses, identifier prefixes and validation are
all asked of `omc-util` per call, for whichever `schemaVersion` the caller passes. That is what makes
`--schema-version .../v2.8` an option rather than a code change. Nothing here maintains tables of
entity types, edge keys or cardinality — keep it that way.

**The mappings are the only place pipelines name OMC properties**, so they are the only thing a
schema change can invalidate. `checkMappings()` runs before any data is read and names every property
and edge the target version does not accept. Do not bypass it.

**A pipeline declares the credentials it needs by name and never learns where they are kept.**
`src/pipeline/secrets.js` resolves them. Do not read a secret or an environment variable from a
pipeline. `PIPELINE_FIXTURES` is not an exception: `lib/paths.js` reads it for the CLI and the
tests, and no pipeline's `run` calls `dayPaths` or `omcPath`.

---

## Traps

- **One omc-util.** Pipelines resolve the service's `omc-util`, the one in this repository's
  lockfile. Picking up an omc-util release here is picking it up for pipelines too, which is the
  point. There is no second copy to keep in step.
- **The Portal's mock catalogue is hand-maintained.** `Labkoat-Portal/.../pipelineApi.mock.js`
  restates the Script-E catalogue entry. A change to a pipeline's roles or options is not reflected
  there until someone edits it.
- **`docs/frameio/data/` is gitignored** (live production content and signed URLs). The scripts
  beside it regenerate it; see `docs/frameio/README.md`.
- **The image carries no tests or docs.** `.dockerignore` leaves out `pipelines/test` and
  `pipelines/docs`. Anything a pipeline needs at runtime must not live there.

---

## Code style

The repository's ESLint config. JSDoc throughout: types live in `types.js` and are resolved
globally, so no `@typedef {import(...)}`. The committed `.d.ts` build and the JSDoc site the
separate package produced were dropped with the move. Restore them only if a second consumer
appears.
