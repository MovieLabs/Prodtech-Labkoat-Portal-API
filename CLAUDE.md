# CLAUDE.md

Guidance for Claude Code (claude.ai/code) working in this repository.

> Cross-repo context — the OMC record, how omc-util and data-pipeline are shared, pipeline
> credentials, deployment topology — is in the parent `MovieLabs-POC/CLAUDE.md`, which loads
> alongside this file.

---

## What this is

**Labkoat-API** is the Express REST gateway (port 8080) that the Portal talks to. Everything the
browser needs goes through here: it proxies OMC reads and writes to fMam, serves the SKOS vocabulary
out of Neo4j, brokers directory and token-exchange calls to Okta and Auth0, and **runs the
processing pipelines in worker threads**.

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
npm run lint             # eslint src app.js

npm run link:local       # links BOTH data-pipeline and omc-util
npm run unlink:local
```

There is **no test script and no tests**.

`app.js` is the entry point; it imports `src/api-server.js`.

### Linking, and the lockfile trap

This repo consumes two sibling working copies. `data-pipeline` in particular **has no git remote and
no tags**, so its declared spec
(`git+https://github.com/MovieLabs/omc-data-pipeline.git#semver:^1.0.0`) resolves to nothing — a
pipeline added to `Data-Pipeline` will not appear in the Portal until it is linked:

```bash
cd ../Data-Pipeline && npm link     # once per machine
cd ../omcUtil        && npm link    # once per machine
npm run link:local
```

- **Any `npm install` here destroys both links** and silently restores whatever was vendored. Re-run
  `link:local`.
- **This repo carries both a `package-lock.json` and a `yarn.lock`.** npm maintains the former and
  also rewrites the latter when linking. **Check `git status` after any link and do not commit
  lockfile churn that is only an artefact of linking.**

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
| `/api/vocab` | `vocab-router` | SKOS and OMC vocabulary, backed by Neo4j (authoritative) |
| `/api/vocab/v1` | `vocab-v1-router` | Views, generators and usage, backed by Mongo (read-only) |
| `/api/greenlight` | `greenlight-router` | approval / permitting workflow |
| `/api/pipeline/v1` | `pipeline-router` | catalog, upload, run, run status, cancel |
| `/api/ingest/v1` | `ingest-router` | upload, process, process status — files as OMC assets |

Almost every route is guarded by `awsJwtValidator` (Cognito) from `mlHelpers`. Two deliberate
exceptions: `POST /api/omc/v1/identifier` and the SKOS download routes (`/skos/json`, `/skos/ttl`)
are unauthenticated.

`omc-router` mirrors fMam's write verbs, and the distinction matters:
`POST /update` **merges** into what fMam holds; `PUT /update` **replaces** — the payload *is* the
entity. `DELETE /edge` is a separate route from `DELETE /update`.

### Controllers (`src/controllers/`)

- `admin/` — `projects.js`, `templates.js`
- `omc/omc-controller.js`, `fMamFetch.js` — the fMam proxy
- `pipeline/` — `pipeline-controller.js`, `ingest-controller.js`
- `vocabulary/` — `skosController.js`, `omcController.js` (Neo4j)
- `directory/` — `directory.js`, `securityController.js`, `user.js`, plus `auth0/`, `okta/` and
  `query/` sub-trees mapping directory records onto OMC
- `token-exchange/` — `exchangeTokenController.js`, `serviceTokenController.js`
- `greenlight/greenlight-controller.js`
- `auth0Interface.js`, `oktaInterface.js`

### The pipeline runner (`src/pipeline/`)

This is the part of the repo with the most design in it. Pipelines themselves live in
**Data-Pipeline**; this directory is the machinery that runs them.

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

### The vocabulary — two stores, mid-migration

**`/api/vocab` (Neo4j) is still authoritative. `/api/vocab/v1` (Mongo) is read-only and additive.**
Both are live; nothing writes to Mongo except the migration.

*Old, unchanged:* `neo4j-driver` is a dependency of **this repo only** — fMam does not touch Neo4j.
`src/neo4J/` and `src/vocabulary/{ttl,jsonld}.js` back `/api/vocab`.

*New:* `src/vocabulary/{store,migrate,generators}/`, `resolve.js`, `generate.js` and
`src/routes/vocab-v1-router.js`. Five `vocab_`-prefixed collections in fMam's **`app_config`**
database — no new database, no new credential (the gateway already loads `SECRET_ARN.FMAM`, which
holds the Mongo user). **Every collection this subsystem creates is `vocab_`-prefixed**; the cluster
is shared and users name their own.

```bash
node src/vocabulary/migrate/run.js env=local            # read, build, verify, print. Writes nothing.
node src/vocabulary/migrate/run.js env=local --write    # ...then write, only if every check passed
node src/vocabulary/generate.js --view view:media-creation --format skos-ttl --out vocab.ttl
```

Things that will bite:

- **Never migrate through `neo4JInterface.query()`.** `getHierarchy` caps `narrower` at `*1..2`;
  three collections are four deep, so it silently loses a level. `getConcept` needs an outgoing
  `broader|narrower`, `getScheme` needs a `prefLabel` Label node. `migrate/readGraph.js` runs its own
  uncapped Cypher for exactly this reason — and finds **3 concepts no cache query returns**, which
  are therefore invisible in the old editor and its export.
- **The live graph has 139 duplicate `topConceptOf` relationships** over 199 distinct pairs. Count
  instances *and* distinct pairs; either alone hides it.
- **`broader`/`narrower` and `topConceptOf` are computed over terms only**, skipping grouping
  members — a grouping is not a broader concept. `resolve.js` owns this.
- **Filtering promotes, it does not strand.** A kept term under a filtered one attaches to the
  nearest surviving ancestor.
- **`coll:unplaced`** holds the 96 terms in no scheme. The old serializer emitted them because it
  walked every Concept; a view publishes a *collection*, so without it they vanish silently.
- `/api/vocab/v1` accepts **either** a Cognito user token or an Okta service token — the Portal and a
  build script are both legitimate callers and hold different credentials.

### Okta is still live here

The legacy Okta *frontend* is gone, but Okta remains a backend dependency: `oktaInterface.js`, the
`directory/okta/` mappers, and the service-token issuer all use it. Cognito authenticates end users;
Okta backs the service API and directory.

---

## Configuration

`src/config.js` merges a `default` block with an environment override selected by a CLI arg
(`env=local` / `env=aws`). Notable keys:

- Cognito: `JWKS_URI`, `USER_POOL_ID`, `CLIENT_ID`, `ISSUER`, `AUDIENCE`
- Downstream: `FMAM_URL`, `GRAPHQL_URL` (localhost:4001 in local mode)
- Okta service API: issuer, default scope, client id
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

**A deployed image cannot use a linked working copy.** Until `Data-Pipeline` is pushed to a remote
and tagged, the `data-pipeline` dependency does not resolve in a Docker build — that is the blocker
on shipping any pipeline work.
