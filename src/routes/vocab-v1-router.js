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
import { fieldCatalogue } from '../vocabulary/fields.js';
import { generate, generatorDescriptors } from '../vocabulary/generators/index.js';
import {
    allTerms,
    getTerm,
    getTerms,
    getView,
    listCollections,
    listFacets,
    listViews,
    searchTerms,
    termUsage,
    unplacedTerms,
} from '../vocabulary/store/read.js';
import { SKOS_PREDICATES } from '../vocabulary/store/validate.js';
import {
    ValidationError,
    arrangeSubtree,
    createFork,
    deleteFork,
    createTerms,
    movePlacement,
    deleteTerm,
    replaceTerm,
    renameArrangement,
    unarrangeSubtree,
    saveFacet,
    createView,
    deleteExportProfile,
    deleteView,
    saveExportProfile,
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

/**
 * What this service can produce, and what it holds. Useful enough to be discoverable.
 *
 * Each entry carries what a client needs to offer a download for a format it has never heard of —
 * its name, what to call it, and what it arrives as — so a generator added here reaches every
 * consumer without a change in any of them.
 */
router.get('/formats', authenticated, (req, res) => {
    res.json({ formats: generatorDescriptors() });
});

/**
 * What a tabular export column may hold, and what a SKOS type may project to.
 *
 * Half of this is not knowable in advance: `label:acronym` exists because somebody added *acronym*
 * to the label set, and adding *trade name* tomorrow has to make `label:tradeName` selectable with
 * no deploy of anything. So it is derived from the controlled sets and served, rather than restated
 * in every client that offers a column picker.
 */
router.get('/export/fields', authenticated, async (req, res, next) => {
    try {
        const facets = await listFacets();
        res.json({ fields: fieldCatalogue(facets), predicates: SKOS_PREDICATES });
    } catch (err) {
        next(err);
    }
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

        // The generator names the file, because the extension is its decision and not the caller's:
        // a format that splits its output ships a zip whatever was asked for. A browser download
        // reads this, so the client needs to know nothing about splitting.
        res.set('Content-Disposition', `attachment; filename="${artifact.filename}"`);
        res.type(artifact.contentType);

        // **A Buffer goes out untouched.** `JSON.stringify` on one produces `{"type":"Buffer",…}`,
        // which is a valid JSON document and a corrupt spreadsheet — the failure then arrives when
        // somebody opens the file rather than when the request is served.
        if (Buffer.isBuffer(artifact.body)) res.send(artifact.body);
        else res.send(typeof artifact.body === 'string' ? artifact.body : JSON.stringify(artifact.body));
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
 * Every term that carries an arrangement, without its members.
 *
 * For the composition palette: which arrangements exist, and how big each is. The members
 * themselves are the bulk of these documents and a picker has no use for them.
 */
router.get('/collections', authenticated, async (req, res, next) => {
    try {
        res.json(await listCollections());
    } catch (err) {
        next(err);
    }
});

/** One arrangement, unresolved. It is a term, so this is the term with its members. */
router.get('/collections/:id', authenticated, async (req, res, next) => {
    try {
        const term = await getTerm(req.params.id);
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

/**
 * Where an arrangement is used.
 *
 * The same route as a term's usage, because it is the same question: including an arrangement is
 * placing the term that carries it. Kept as its own path so a client asking about a collection does
 * not have to know that.
 */
router.get('/collections/:id/usage', authenticated, async (req, res, next) => {
    try {
        res.json(await termUsage(req.params.id));
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

/** Create a view, its identifier minted from its name. */
router.post('/views', authenticated, async (req, res, next) => {
    try {
        res.status(201).json(await createView(req.body, actorOf(req)));
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

/**
 * Write one format's export profile onto a view.
 *
 * Its own route rather than a field on `PUT /views/:id`, which replaces the whole document. Every
 * caller of that has to load the record and spread it first, and the tag map and the `arrange` lists
 * have each had to be rescued from a body built from a form's fields alone. This sets one key.
 */
router.put('/views/:id/export/:format', authenticated, async (req, res, next) => {
    try {
        res.json(await saveExportProfile(
            req.params.id, req.params.format, req.body, actorOf(req),
        ));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Take a format's profile off a view, so it publishes the default again. */
router.delete('/views/:id/export/:format', authenticated, async (req, res, next) => {
    try {
        res.json(await deleteExportProfile(req.params.id, req.params.format, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Delete a view. The collection it publishes, and everything in it, are untouched. */
router.delete('/views/:id', authenticated, async (req, res, next) => {
    try {
        res.json(await deleteView(req.params.id));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Create or replace a facet -- the controlled set behind a kind of label, note, example or tag. */
router.put('/facets/:id', authenticated, async (req, res, next) => {
    try {
        const { facet, warnings } = await saveFacet(
            req.params.id, req.body, actorOf(req), req.query.force === 'true',
        );
        res.json({ facet, warnings });
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Give a term another arrangement of its own.
 *
 * **One term, one identifier — several hierarchies.** A fork varies how the term is arranged
 * beneath, never what the term is, which is the difference between this and copying it.
 *
 * `empty` for a fork with no members; otherwise it copies an existing arrangement — `copyOf` names
 * a fork id, or is omitted for the term's default.
 */
router.post('/terms/:id/forks', authenticated, async (req, res, next) => {
    try {
        const { name, copyOf = null, empty = false } = req.body ?? {};
        if (!name) {
            res.status(422).json({ message: 'name is required', errors: ['A fork needs a name'] });
            return;
        }
        res.status(201).json(await createFork(req.params.id, { name, copyOf, empty }, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Name an arrangement. Nothing published moves — rows point at a fork's id, which never changes,
 * and the default is never pointed at by name at all.
 *
 * `:forkId` is `default` for the term's own arrangement, which has no id of its own.
 */
router.put('/terms/:id/forks/:forkId', authenticated, async (req, res, next) => {
    try {
        const { name } = req.body ?? {};
        if (!name) {
            res.status(422).json({ message: 'name is required', errors: ['An arrangement needs a name'] });
            return;
        }
        const forkId = req.params.forkId === 'default' ? null : req.params.forkId;
        res.json(await renameArrangement(req.params.id, forkId, name, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Delete a fork.
 *
 * Refused while anything still brings it, unless `?force=true`. The rows inside it are placements,
 * so the terms they arranged are untouched either way.
 */
router.delete('/terms/:id/forks/:forkId', authenticated, async (req, res, next) => {
    try {
        res.json(await deleteFork(
            req.params.id, req.params.forkId, req.query.force === 'true', actorOf(req),
        ));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Move a term's subtree onto the term, so it can be reused wherever the term is placed.
 *
 * The term's row does not move, so what this container publishes does not change — see
 * `arrangeSubtree` for why.
 */
router.post('/containers/:id/arrange', authenticated, async (req, res, next) => {
    try {
        const { mid } = req.body ?? {};
        if (!mid) {
            res.status(422).json({ message: 'mid is required', errors: ['Say which member to arrange'] });
            return;
        }
        res.status(201).json(await arrangeSubtree(req.params.id, mid, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Move a placement, and everything beneath it, to another parent.
 *
 * One request rather than a remove and an add, so a subtree is no harder to move than a leaf and the
 * rows are never in neither place.
 */
router.post('/containers/:id/move', authenticated, async (req, res, next) => {
    try {
        const { mid, toId, toParent = null } = req.body ?? {};
        if (!mid || !toId) {
            res.status(422).json({
                message: 'mid and toId are required',
                errors: ['Say which member to move, and where it is going'],
            });
            return;
        }
        res.json(await movePlacement({
            fromId: req.params.id, mid, toId, toParent,
        }, actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * Give a term's arrangement back to this container, and stop sharing it.
 *
 * The inverse of arranging, and the reason making something reusable is not a one-way door. Every
 * other placement of the term loses what was under it, so this warns unless `force` is set.
 */
router.post('/containers/:id/unarrange', authenticated, async (req, res, next) => {
    try {
        const { mid } = req.body ?? {};
        if (!mid) {
            res.status(422).json({ message: 'mid is required', errors: ['Say which member to revert'] });
            return;
        }
        res.json(await unarrangeSubtree(req.params.id, mid, actorOf(req), req.query.force === 'true'));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

export default router;
