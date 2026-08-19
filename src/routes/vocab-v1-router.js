/**
 * `/api/vocab/v1` — reading and writing the vocabulary, and publishing a view.
 *
 * **Writes land here, not in Neo4j.** The old `/api/vocab` routes still serve the old editor, and
 * the two stores are not synchronised: a term created here does not appear there. That is the point
 * of the staging — the new tool is exercised against real writes while the old one keeps working —
 * but it is worth knowing before wondering why a term is missing from the other tab.
 *
 * ## Two kinds of caller, both legitimate
 *
 * The design called for service-token auth so a build script in another repository could fetch a
 * view. But the Portal is a consumer too, and it holds a **Cognito** user token, not an Okta service
 * token. Requiring one would lock out the browser; requiring the other would lock out the build.
 *
 * So a request is accepted if **either** validates. That is not a weakening: each validator still
 * verifies its own issuer, audience and signature, and a token from neither is refused. It also
 * closes the standing anomaly where `/api/vocab/skos/ttl` and `/skos/json` are the only
 * unauthenticated routes on this service — the vocabulary is currently world-readable by anyone who
 * knows the URL.
 *
 * @module routes/vocab-v1-router
 */

import express from 'express';
import { awsJwtValidator, jwtValidator } from 'mlHelpers';

import config from '../config.js';
import { driftReport } from '../vocabulary/driftReport.js';
import { generate, generatorNames } from '../vocabulary/generators/index.js';
import {
    allTerms,
    collectionUsage,
    getCollection,
    getTerms,
    getView,
    listCollections,
    listFacets,
    listViews,
    searchTerms,
    termUsage,
    unplacedTerms,
} from '../vocabulary/store/read.js';
import {
    ValidationError,
    createCollection,
    createTerms,
    deleteCollection,
    forkCollection,
    forkTerm,
    deleteTerm,
    replaceCollection,
    replaceTerm,
    saveFacet,
    saveView,
} from '../vocabulary/store/write.js';

const router = express.Router();

/** The Okta service-token validator. Same issuer and audience the service API already uses. */
const oktaValidator = jwtValidator({
    audience: 'https://service.labkoat.media',
    issuer: config.OKTA_LABKOAT_SERVICE_API_ISSUER,
    jwksUri: `${config.OKTA_LABKOAT_SERVICE_API_ISSUER}/v1/keys`,
});

/**
 * Accept a request that satisfies either validator.
 *
 * The **first** error is the one reported when both fail. A browser calling with an expired Cognito
 * token should be told that, not told its token is not a valid Okta service token — the second
 * message describes a credential it was never going to present.
 *
 * @param {Function} first
 * @param {Function} second
 * @returns {Function} Express middleware
 */
function eitherAuth(first, second) {
    return (req, res, next) => {
        first(req, res, (firstError) => {
            if (!firstError) {
                next();
                return;
            }
            second(req, res, (secondError) => {
                next(secondError ? firstError : undefined);
            });
        });
    };
}

const authenticated = eitherAuth(awsJwtValidator, oktaValidator);

/**
 * `?status=published,review` overrides the view's own default.
 *
 * @param {object} query
 * @returns {string[]|null}
 */
const statusFrom = ((query) => (typeof query.status === 'string' && query.status.length
    ? query.status.split(',').map((value) => value.trim()).filter(Boolean)
    : null));

/** What this service can produce, and what it holds. Useful enough to be discoverable. */
router.get('/formats', authenticated, (req, res) => {
    res.json({ formats: generatorNames() });
});

/** Every view. */
router.get('/views', authenticated, async (req, res, next) => {
    try {
        res.json(await listViews());
    } catch (err) {
        next(err);
    }
});

/**
 * One view, resolved and rendered.
 *
 * `?format=` selects a generator and defaults to `json` — the shaped document, not the internal
 * shape, so a consumer is never accidentally coupled to how resolution works.
 *
 * Problems are returned in a header rather than mixed into the body: a Turtle document has nowhere
 * to put them, and a caller piping the response to a file should still be able to see that a
 * hundred terms were dropped.
 */
router.get('/views/:id', authenticated, async (req, res, next) => {
    try {
        const artifact = await generate({
            viewId: req.params.id,
            format: req.query.format ?? 'json',
            status: statusFrom(req.query),
            language: req.query.language,
        });

        const problems = Object.entries(artifact.problems ?? {})
            .filter(([, value]) => (Array.isArray(value) ? value.length : value));
        if (problems.length) {
            res.set('X-Vocab-Problems', JSON.stringify(Object.fromEntries(problems)).slice(0, 900));
        }

        res.type(artifact.contentType);
        res.send(typeof artifact.body === 'string' ? artifact.body : JSON.stringify(artifact.body));
    } catch (err) {
        if (err.message?.startsWith('No such')) {
            res.status(404).json({ message: err.message });
            return;
        }
        next(err);
    }
});

/** One view's stored record, unresolved — what the editor needs to show its settings. */
router.get('/views/:id/record', authenticated, async (req, res, next) => {
    try {
        const view = await getView(req.params.id);
        if (!view) {
            res.status(404).json({ message: `No such view: ${req.params.id}` });
            return;
        }
        res.json(view);
    } catch (err) {
        next(err);
    }
});

/**
 * Every collection, without its members.
 *
 * For the membership editor's picker: which collections exist, and how big each is. The members
 * themselves are the bulk of these documents and a picker has no use for them.
 */
router.get('/collections', authenticated, async (req, res, next) => {
    try {
        res.json(await listCollections());
    } catch (err) {
        next(err);
    }
});

/** One collection, unresolved. */
router.get('/collections/:id', authenticated, async (req, res, next) => {
    try {
        const collection = await getCollection(req.params.id);
        if (!collection) {
            res.status(404).json({ message: `No such collection: ${req.params.id}` });
            return;
        }
        res.json(collection);
    } catch (err) {
        next(err);
    }
});

/**
 * Where a term is used.
 *
 * This is what the change-everywhere / separate-copy prompt is built on: before an edit, the editor
 * asks this and shows the answer, because both outcomes are legitimate and the user is the one who
 * decides which applies.
 */
router.get('/terms/:id/usage', authenticated, async (req, res, next) => {
    try {
        res.json(await termUsage(req.params.id));
    } catch (err) {
        next(err);
    }
});

/** Where a collection is used. Same purpose, for an inclusion rather than a term. */
router.get('/collections/:id/usage', authenticated, async (req, res, next) => {
    try {
        res.json(await collectionUsage(req.params.id));
    } catch (err) {
        next(err);
    }
});

/**
 * Drift between a view and a JSON Schema, in both directions.
 *
 * **A POST because the schema is the input.** This service does not hold the schema and must not
 * depend on the library that does — the dependency points the other way, from a build step that
 * consumes a view. So the caller sends the document and gets back what the two disagree about.
 *
 * Body: `{ schema, viewId?, status? }`. The schema is a parsed JSON Schema document; anything with
 * `x-controlledValues` arrays in it will be read, whatever else it is.
 */
router.post('/drift', authenticated, async (req, res, next) => {
    try {
        const { schema, viewId = 'view:omc-controlled-values', status = null } = req.body ?? {};
        if (!schema || typeof schema !== 'object') {
            res.status(422).json({
                message: 'A schema document is required',
                errors: ['Send the parsed JSON Schema as `schema` in the body'],
            });
            return;
        }
        res.json(await driftReport({ viewId, schema, status }));
    } catch (err) {
        if (err.message?.startsWith('No such')) {
            res.status(404).json({ message: err.message });
            return;
        }
        next(err);
    }
});

/** The controlled sets, for the editor and for anything projecting to SKOS itself. */
router.get('/facets', authenticated, async (req, res, next) => {
    try {
        res.json(await listFacets());
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------------

/**
 * Turn a refused write into a 422 carrying every reason.
 *
 * All of them, not the first: a caller fixing one error at a time round-trips once per mistake,
 * and the editor can show them together.
 */
function writeFailed(err, res, next) {
    if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message, errors: err.errors });
        return;
    }
    next(err);
}

/** Who is writing, for the record stamp. Cognito puts it in the token; a service token has no user. */
const actorOf = ((req) => req.user?.username ?? req.user?.sub ?? req.auth?.sub ?? 'service');

/**
 * Search terms by name.
 *
 * Registered before `/terms/:id` would match it — Express takes the first route whose path matches,
 * and `/terms` is not `/terms/:id`, so the two do not collide. `?q=` empty returns the first page,
 * which is what an editor opening the picker before typing anything should see.
 */
router.get('/terms', authenticated, async (req, res, next) => {
    try {
        // `?all=true` is for an editor rather than a picker: the table lists every term so the ones
        // in no collection are reachable — 96 of them, invisible in any view because a view
        // publishes a collection. The search cap does not apply, deliberately; this is one request
        // returning the store, the way the SKOS editor loads its whole dictionary.
        if (req.query.all === 'true') {
            res.json(await allTerms());
            return;
        }

        // `?unplaced=true` — terms no collection places. Computed rather than read off a
        // collection, so placing one takes it off the list immediately.
        if (req.query.unplaced === 'true') {
            res.json(await unplacedTerms());
            return;
        }

        // `?ids=` is the other question this route answers: the membership editor holds a member
        // list of term ids and has to render names for all of them. One lookup rather than one
        // request per row — a collection here holds 312 members.
        if (typeof req.query.ids === 'string') {
            const ids = req.query.ids.split(',').map((id) => id.trim()).filter(Boolean);
            const found = await getTerms(ids);
            res.json([...found.values()]);
            return;
        }
        const limit = Math.min(Number(req.query.limit) || 25, 200);
        res.json(await searchTerms(req.query.q ?? '', limit));
    } catch (err) {
        next(err);
    }
});

/** One term, for the editor to load before changing it. */
router.get('/terms/:id', authenticated, async (req, res, next) => {
    try {
        const found = await getTerms([req.params.id]);
        const term = found.get(req.params.id);
        if (!term) {
            res.status(404).json({ message: `No such term: ${req.params.id}` });
            return;
        }
        res.json(term);
    } catch (err) {
        next(err);
    }
});

/**
 * Create terms. Takes one or an array.
 *
 * An array is minted as one block, which is what lets a spreadsheet import run in a single pass
 * rather than one write per row waiting on the last -- the constraint that shapes the old CSV
 * import and made a failure halfway through leave the client's ids guessing.
 */
router.post('/terms', authenticated, async (req, res, next) => {
    try {
        const incoming = Array.isArray(req.body) ? req.body : [req.body];
        const { terms, warnings } = await createTerms(incoming, actorOf(req));
        res.status(201).json({ terms, warnings });
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Replace a term. A full replace, so a label or note can actually be removed. */
router.put('/terms/:id', authenticated, async (req, res, next) => {
    try {
        const { term, warnings } = await replaceTerm(req.params.id, req.body, actorOf(req));
        res.json({ term, warnings });
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Delete a term and every placement of it. Refused while in use unless `?force=true`. */
router.delete('/terms/:id', authenticated, async (req, res, next) => {
    try {
        const outcome = await deleteTerm(req.params.id, req.query.force === 'true');
        res.json(outcome);
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Create a collection. */
router.post('/collections', authenticated, async (req, res, next) => {
    try {
        res.status(201).json(await createCollection(req.body, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Replace a collection, members and all -- re-parenting and reordering are edits to that array. */
router.put('/collections/:id', authenticated, async (req, res, next) => {
    try {
        res.json(await replaceCollection(req.params.id, req.body, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Delete a collection. The terms in it stay. */
router.delete('/collections/:id', authenticated, async (req, res, next) => {
    try {
        res.json(await deleteCollection(req.params.id, req.query.force === 'true'));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Create or replace a view. */
router.put('/views/:id', authenticated, async (req, res, next) => {
    try {
        res.json(await saveView(req.params.id, req.body, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Create or replace a facet -- the controlled set behind a kind of label, note, example or tag. */
router.put('/facets/:id', authenticated, async (req, res, next) => {
    try {
        const { facet, warnings } = await saveFacet(req.params.id, req.body, actorOf(req));
        res.json({ facet, warnings });
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Fork a term into one collection — the "use a separate copy here" half of the edit decision.
 *
 * A fork mints a new identifier, so for a consumer keying on the old one this is a breaking change
 * wearing an edit's clothes. The caller is expected to have said so before calling.
 */
router.post('/terms/:id/fork', authenticated, async (req, res, next) => {
    try {
        const { inCollection } = req.body ?? {};
        if (!inCollection) {
            res.status(422).json({ message: 'inCollection is required', errors: ['Say which collection the copy belongs to'] });
            return;
        }
        res.status(201).json(await forkTerm(req.params.id, inCollection, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Fork a collection. The copy holds the same terms — forking an arrangement is not forking meaning. */
router.post('/collections/:id/fork', authenticated, async (req, res, next) => {
    try {
        const { name, inCollection = null } = req.body ?? {};
        res.status(201).json(await forkCollection(req.params.id, name, inCollection, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

export default router;
