# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

> Cross-repo context — the OMC record, how omc-util is shared, pipeline credentials, deployment
> topology — is in the parent `MovieLabs-POC/CLAUDE.md`, which loads
> alongside this file.

---

## What this is

**Labkoat-API** is the Express REST gateway (port 8080) that the Portal talks to. Everything the
browser needs goes through here: it proxies OMC reads and writes to fMam, serves the vocabulary out
of MongoDB, and **runs the processing pipelines in worker threads**.

The directory was renamed from `Prodtech-Labkoat-Portal-API-2` on 2026-07-29, but nothing else was:
the package is named `service`, the GitHub remote is still `Prodtech-Labkoat-Portal-API`, and the
ECR image is `ml-prodtech-portal-api`. Do not "fix" those strings.

ES modules (`"type": "module"`), plain `.js` throughout.

---

## Commands

```bash
npm install
npm start                # === node app.js — port 8080
node app.js
npm run lint             # eslint src pipelines app.js
npm test                 # the pipeline tests — PIPELINE_FIXTURES=.. to include the fixture ones
npm run pipeline -- <cmd>  # the pipeline CLI (pipelines/cli.js)
npm run greenlight -- post <file.json> | list | publish <id>  # SRP login, then the submission routes

npm run link:local       # links omc-util
npm run unlink:local
```

`npm test` covers `pipelines/` only; the service code has no tests, beyond the `verify:*` scripts
that check single subsystems. See `pipelines/CLAUDE.md` for the fixtures.

`app.js` is the entry point; it imports `src/api-server.js`.

### Linking, and the lockfile trap

The one sibling working copy this repo links is omc-util:

```bash
cd ../omcUtil && npm link    # once per machine
npm run link:local
```

- **Any `npm install` here destroys the link** and silently restores whatever the lockfile pins.
  Re-run `link:local`.
- **Check `git status` after any link** and do not commit lockfile churn that is only an artefact
  of linking.

---

## Architecture

### Entry flow

`app.js` → `src/api-server.js`: AWS secrets → cookie-parser / json / urlencoded / static / CORS →
`routeLog` → routers → `/:universalURL` catch-all raising `InvalidRoute` → `errorHandler`.

### Routes

| Mount | Router | Purpose |
|---|---|---|
| `/api/admin` | `admin-router` | projects (GET/POST/PATCH/DELETE), `DELETE /reset`, mapping templates |
| `/api/omc/v1` | `omc-router` | OMC entities + GraphQL — mostly a proxy to fMam |
| `/api/vocab/v1` | `vocab-v1-router` | Terms, collections, views, facets, generators and usage — read *and write*, backed by Mongo |
| `/api/vocab/v1` | `vocab-edges-v1-router` | **The same mount**: `/edge-settings`, `/edge-classes`, `/edge-predicates`, `/edges`, plus the edges' own `/edges/check`, `/edges/accept`, `/edges/formats`, `/edges/publish` |
| `/api/greenlight` | `greenlight-router` | the Portal's Greenlight tab: `POST /ping` echoes the body and the caller; `/submissions` holds JSON a script posts until its sender publishes it from the Portal |
| `/api/pipeline/v1` | `pipeline-router` | catalog, upload, run, run status, cancel |
| `/api/ingest/v1` | `ingest-router` | upload, process, process status — files as OMC assets |

Every route is guarded by `awsJwtValidator` (Cognito) from `mlHelpers` except two, deliberately:
`POST /api/omc/v1/identifier`, and `/api-docs`, which serves the OpenAPI description a client needs
before it has a token.

`omc-router` mirrors fMam's write verbs, and the distinction matters:
`POST /update` **merges** into what fMam holds; `PUT /update` **replaces** — the payload *is* the
entity. `DELETE /edge` is a separate route from `DELETE /update`.

### Controllers (`src/controllers/`)

- `admin/` — `projects.js`, `templates.js`
- `omc/omc-controller.js`, `fMamFetch.js` — the fMam proxy
- `pipeline/` — `pipeline-controller.js`, `ingest-controller.js`
- `greenlight/greenlight-controller.js`

### The pipeline runner (`src/pipeline/`)

This is the part of the repo with the most design in it. Pipelines themselves live in
**`pipelines/`**, at the top level and not under `src/` (one letter from this directory). This
directory is the machinery that runs them.

**`pipelines/` is kept apart from the service code:** the service reaches it only through the
`package.json` aliases `#pipelines` (the worker) and `#pipelines/catalog` (the controller, lazily),
a pipeline imports nothing from `src/`, and ESLint enforces both. Pipelines resolve this repo's omc-util, so there is one version, not two. See
`pipelines/CLAUDE.md`.

| Module | Role |
|---|---|
| `workerPool.js` | bounded pool of worker threads |
| `runner.worker.js` | the worker entry — loads a pipeline from the catalogue and runs it |
| `jobStore.js` | in-memory record of runs |
| `storage.js` | uploads, S3 or local |
| `secrets.js` | resolves a pipeline's named credentials |
| `projectConfig.js` | per-project pipeline settings |
| `mappingTemplates.js` | resolves a project's mapping templates at dispatch |
| `assetIdentity.js` | identity for ingested asset files |

**Worker threads, not a separate service and not in-process.** Each worker is its own V8 isolate, so
a pipeline chewing through a large PDF does not block the gateway's event loop; `resourceLimits`
bounds what a runaway parse can allocate, so the worker dies rather than the pod; and `terminate()`
gives real cancellation, which async work on the main thread cannot.

**Runs are disposable.** A run is dead once its OMC has reached the Portal's Staging model, so
nothing is persisted, there is no history, and a restart loses whatever was in flight. This is a
deliberate proof-of-concept choice, not an omission.

> **The consequence a deployment must respect: `POST /run` and `GET /run/:runId` must reach the same
> process.** These routes are only correct on a **single replica** — with more than one, a poll can
> land on a process that never saw the run and answers 404. Pin the replica count or use session
> affinity at the ingress.

`jobStore` sweeps expired runs on every write, so there is no timer to leak and an idle process does
no work.

**The upload route bypasses `express.json`** because it is `multipart/form-data` — that middleware
only claims `application/json`, so the raw stream reaches busboy untouched, which is what lets a
multi-gigabyte delivery stream to S3 rather than buffer in memory.

### Greenlight submissions (`src/greenlight/`)

A person posts JSON blocks from a script and publishes each one later from the Portal's Greenlight
tab. The contract is `Labkoat-Portal/docs/greenlight-contract.md`.

- **One user, two logins, joined by `sub`.** The script signs in with Cognito's `USER_SRP_AUTH`
  (`tools/greenlight/greenlight.mjs` is the harness and the example to hand over), and the Portal
  with PKCE. Both use the Portal's app client, so both tokens carry the same `sub`, and every
  submission is held, listed and published under it.
- **The gate is a group named `greenlight` under any organisation** (`GREENLIGHT_GROUP` in
  `access.js`), checked with `cognitoValidator`, not `awsJwtValidator`, which would demand a
  `labkoat` group and shut other organisations out.
- **In memory, like pipeline runs**: lost on restart, correct only on a single replica, swept after
  `GREENLIGHT_TTL_MS`. Publishing removes a submission; `publish.js` is where its action goes.
- `npm run verify:greenlight` checks the gate, the store and the controllers without a token.

### Credentials

A pipeline declares what it needs **by name** (`secrets: ['yamdu']`) and never learns where it is
kept — `src/pipeline/secrets.js` decides. `credentialsFor()` returns
`{ name, source: 'service'|'user', provider }`, and `pipeline-controller.js` decorates each catalogue
entry with it, so a client can offer the right login for a pipeline it has never seen.

- **Yamdu is service-owned** — read from AWS Secrets Manager at boot. Never on a project record,
  never sent to the browser.
- **Frame.io is user-supplied** — the Portal logs the user in against Adobe IMS and sends the access
  token with the run request; it is handed to the worker and never persisted.

Non-secret per-project values (a Yamdu or Frame.io project id) go in the project's `settings`
instead.

### The wire contracts live in the Portal

`/api/pipeline/v1` and `/api/ingest/v1` are specified in
`Labkoat-Portal/src/Components/Omc/Import/Pipeline/CONTRACTS.md` and `…/Ingest/CONTRACTS.md`, and the
Portal's mocks implement them exactly. Both routers carry a JSDoc pointer to their file. **Change a
shape here and change it there**; ingest is a separate namespace over the same storage, job-store and
worker modules purely so the built ingest UI stayed untouched.

### The vocabulary — one store, in Mongo

**`/api/vocab/v1` is the vocabulary.** It reads and writes terms, views and facets. **There is no
collection store**: a collection is a `member` array on the term that carries it, so
`vocab_collections` is gone and an arrangement has no identifier of its own. See the Portal's
`src/Components/Vocabulary/CLAUDE.md`.

*The store:* `src/vocabulary/{store,generators}/`, `resolve.js`, `generate.js`, `driftReport.js`,
`drift.js`, `skosCheck.js` and `src/routes/vocab-v1-router.js`. The three top-level `.js` files with
a usage block at the top — `generate.js`, `drift.js`, `skosCheck.js` — are command-line tools, not
modules the router imports. Seven
`vocab_`-prefixed collections in fMam's **`app_config`** database — `vocab_terms`, `vocab_views`,
`vocab_facets`, `vocab_settings`, `vocab_counters`, and the edges' `vocab_edges` and
`vocab_edge_predicates` — with no new database and no new credential (the gateway already loads
`SECRET_ARN.FMAM`, which holds the Mongo user). **Every collection this subsystem creates is
`vocab_`-prefixed**; the cluster is shared and users name their own.

```bash
node src/vocabulary/generate.js --view view:media-creation --format skos-ttl --out vocab.ttl
node src/vocabulary/drift.js --schema ../omcUtil/src/omc/validation/schema/OMC-JSON-v3.0.schema.json
node src/vocabulary/skosCheck.js --view view:media-creation
```

**Seeding a fresh store has no entry point.** `store/facetSeeds.js` still holds `FACET_SEEDS` and
`seedFacets`, but their only callers were those CLIs, so a new database cannot currently be seeded
without writing one. The data is kept for that reason; `skosProjectionIndex` in the same file is
live and used by the generators.

### The edges — one stored edge, two projections

`src/vocabulary/edges/` and `src/routes/vocab-edges-v1-router.js` author the relationships *between*
classes, on the same `/api/vocab/v1` mount as the terms. Two collections: `vocab_edges` and
`vocab_edge_predicates`, the registry of verbs an edge can use.

**An edge is one record carrying two directions**, `forward` and `reverse`, and **OMC-JSON and RDF are
two projections of it** — never two records. Each direction's names are generated from the pair and
the ends (`naming.js`), and either may be overridden by hand; `check.js` reports the difference rather
than silently preferring one.

**`check.js` reports codes and facts; `problems.js` turns each into a sentence.** Kept apart
deliberately, so the check stays a list of facts a test can compare — `npm run verify:edges` runs
`edges.verify.mjs` against a fixture, and it is the only test this subsystem has.

**RDF names are generated as `{verb}{Range}`, and two different pairs can therefore land on one
name** — `Realization —usedBy→ Composition` and `Depiction —usedBy→ Composition` both become
`omc:usedByComposition`. That is the `rdfConflict` problem. It is a **warning, not an error**: the
data is publishable, but **nothing can declare `owl:inverseOf` on a name that answers two different
reverses**, so the fix is a rename of one pair rather than anything the generator can do.

**An end may be narrowed to a class in a qualifier tree.** A qualifier tree is a term's own
arrangement, named in `settings.qualifiers` (`store.js`), whose members *qualify* an end but can never
be an edge end themselves — Asset Function is the case it was built for, and the reason a range cannot
simply be re-pointed at one. `classes.js` reads the trees out of the view; `qualifierFor` and
`takesQualifier` answer which apply where.

- **A narrowing is exported as `rangeOf` — `{ class, function: { path, class } }` — and never
  rewrites `ranges`.** The range stays what the class model says; the narrowing is an extra
  assertion beside it.
- **The narrowing supplies `{Range}` in the generated name**, so moving it changes what the name would
  be generated as. Anything holding a name in a form has to let go of it when the narrowing moves, or
  it posts the old name back as a hand-set override — which is how the Portal's edit form briefly
  reported a drift it had caused itself.
- Duplicate detection counts the qualifier as **part of the end** (`validate.js`), so `Asset` and
  `Asset(Script)` are different ends of otherwise identical edges.
- Three problem codes cover a tree that moves underneath a stored narrowing: `qualifierGone`,
  `qualifierNotCarried`, `qualifierRenamed`.

**Turtle and SHACL are not generated here.** The four formats are `json`, `csv`, `matrix-csv` and
`markdown`; the RDF is built outside this service from the published JSON, which is why
`generators/owl.js` and `edges/handoff/` were deleted rather than kept as a second implementation to
drift. See the parent `CLAUDE.md` and, for what the Portal's tab draws,
`Labkoat-Portal/src/Components/Vocabulary/CLAUDE.md`.

### Ids and labels

OMC's controlled values are terms in this store: a value that matched an existing term became a
*placement* of it, and the rest became terms of their own.

**Every id carries one namespace, `mlv:`** — `NAMESPACE` in `store/ids.js`, which minting, the scheme
and collection ids, and the SKOS prefix map all read. Stored ids carry it and are written out as
CURIEs exactly as stored, so changing it is a migration of the store, never just of that constant.

- **A view can name which kind of label it publishes** (`view.labelType`, default `pref`).
  **`view:asset-function-values` is the only one that does** — `omcToken` with
  `labelStyle: 'dotted'`, so `capture` + `witnessCamera` renders `capture.witnessCamera`, the string
  the schema actually holds. (There is no `view:omc-controlled-values`; that name is what this view
  used to be called, and the docs said it long after it stopped being true.)
  - **Every substituted name is counted in `problems.untyped`, and a CSV column cannot show you
    one.** Where a term carries no authored `omcToken`, `DERIVABLE` in `store/read.js` derives one
    from the preferred label, so the exported column is filled either way — a derived guess and an
    authored value are indistinguishable in the artifact. `problems.untyped` is the only thing that
    tells them apart, which is why it is worth reading rather than the file.
  - It should be zero for that view, because a wrong controlled value looks exactly like a right
    one. **It is not, and has not been for a long time** — most of that view's tokens are derived
    guesses rather than authored values. Check the count before trusting the view's output; do not
    read a filled column as a settled one.
- **`seedFacets` cannot add a value to a facet that already exists.** `$setOnInsert` writes a facet
  whole or not at all, so a new value in `FACET_SEEDS` never reaches a live store — it fails quietly
  and downstream, where the SKOS export drops labels using it and the validator refuses the next
  edit to any term carrying one. `reconcileFacetValues` exists for this and both CLIs call it.

### The drift report

`POST /api/vocab/v1/drift` with `{ schema, viewId?, status? }`, or `drift.js --schema <path>`. **The
schema is an argument, never an import** — this service must not depend on omc-util; the dependency
points the other way, from a build step that consumes a view.

Schema tables are matched to collections by **value overlap, never by name**: `assetFunctionType` is
the graph's `functionalType (Asset)`, and six schema tables correspond to properties all called
`narrativeType`. A name mapping would be one more copy of the same knowledge, drifting alongside it.

`x-controlledValues` is advisory (Ajv ignores `x-` keywords), so without this report the drift is
invisible. Run it rather than trusting a remembered count.

Things that will bite:

- **`broader`/`narrower` and `topConceptOf` are computed over terms only**, skipping grouping
  members — a scheme head is the vocabulary, not a concept broader than what is in it. `resolve.js`
  owns this, and `schemeHeads` decides which terms are schemes at all.
- **Filtering promotes, it does not strand.** A kept term under a filtered one attaches to the
  nearest surviving ancestor.
- **Unplaced terms are computed, never stored.** `coll:unplaced` was a snapshot that went stale the
  moment one of its terms was placed. `unplacedTerms()` asks the question instead — a term nothing
  places, counting views as placing, since a term attached straight to a view sits in no other term's
  arrangement and is not unplaced.
- `/api/vocab/v1` accepts **either** a Cognito user token or a Cognito machine token — the Portal and
  a build script are both legitimate callers and hold different credentials. They are told apart by
  their claims: a machine token carries a `scope` and no `cognito:groups`, a user's carries the
  reverse.
- **`GET /terms` answers two different questions.** With `?q=` it searches by name, prefix-first;
  with `?ids=` it looks up a named batch. The membership editor needs the second to put a name on
  each of an arrangement's members — 312 in the largest — and the client batches at 150 ids because a
  query string is not unbounded.
- **A collection's `_id` is minted from its name and never changes.** `createCollection` ignores an
  `_id` in the body, so a caller that sets one and then reads it back by that id finds nothing.
- **A collection is written whole.** `PUT /collections/:id` replaces the member array, which is what
  makes re-parenting and reordering ordinary edits. Validation refuses an orphan, a parent cycle and
  a self-inclusion, so the *intermediate* states of an ordinary rearrangement would each be rejected
  — which is why the editor holds the arrangement locally and writes once.

### Auth

Cognito issues every token: the user tokens the Portal presents, and the machine token this service
presents to fMam (a client_credentials grant; `serviceToken.setup` in `api-server.js`).

---

## Configuration

`src/config.js` merges a `default` block with an environment override selected by a CLI arg
(`env=local` / `env=aws`). Notable keys:

- Cognito: `JWKS_URI`, `USER_POOL_ID`, `CLIENT_ID`, `ISSUER`, `AUDIENCE`
- Downstream: `FMAM_URL`, `GRAPHQL_URL` (localhost:4001 in local mode)
- Cognito machine token: `COGNITO_TOKEN_URL`, `COGNITO_M2M_CLIENT_ID`, `COGNITO_M2M_SCOPE`
- Pipelines: `PIPELINE_WORKER_COUNT` (2), `PIPELINE_WORKER_MEMORY_MB` (1024),
  `PIPELINE_RUN_TIMEOUT_MS` (15 min), `PIPELINE_RUN_TTL_MS` (30 min — how long a finished run stays
  readable), `PIPELINE_MAX_UPLOAD_BYTES` (2 GB)
- Storage: `PIPELINE_STORAGE` (`s3` in aws, `local` in local mode), `PIPELINE_BUCKET`
  (`labkoat-project`), `PIPELINE_LOCAL_ROOT`
- `SECRET_ARN.{LABKOAT,FMAM}` — AWS Secrets Manager, read at startup

---

## Code style

ESLint flat config (`eslint.config.js`) with the `@stylistic` plugin, matching the other backends:
4-space indentation, single quotes, semicolons, trailing commas on multiline, `prefer-const`,
`no-var`, `prefer-template`, `object-shorthand`, import ordering builtin → external → internal →
parent → sibling → index (alphabetized), unused vars prefixed `_` allowed, `no-console: off`.

JSDoc is preferred; the pipeline modules are documented with `@namespace namespace:LabkoatApi.*` and
are worth reading before changing them — most of the design rationale is written down there rather
than here.

---

## CI/CD

Push to `main` triggers `.github/workflows/node-app.yml`: Docker build → push to AWS ECR
`ml-prodtech-portal-api` at `113736696237.dkr.ecr.us-west-2.amazonaws.com` → repository dispatch
(`event-type: new-image`) to `MovieLabs/Prodtech-ServiceMesh` for Kubernetes deployment.

**The workflow lints and tests before it builds**: `npm install` (not `npm ci`, because omc-util is
locked as `git+ssh` and the runner has no key), `npm run lint`, `npm test`. `PIPELINE_FIXTURES` is
unset there, so the fixture tests skip: a green run does not cover the golden comparison.

**`.dockerignore` shapes the image**: no `node_modules` (so a local `npm link` cannot leak in), no
`.env`, and no `pipelines/test` or `pipelines/docs`.

**A deployed image cannot use a linked working copy.** omc-util reaches the image only as the commit
the lockfile pins.
