/**
 * `/api/vocab/v1` — reading the vocabulary, and publishing a view.
 *
 * Read-only for now. Writes arrive with the authoring stage; until then the old `/api/vocab` routes
 * remain the only way to change anything, and Neo4j remains authoritative.
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
import { generate, generatorNames } from '../vocabulary/generators/index.js';
import { collectionUsage, getCollection, getView, listFacets, listViews, termUsage } from '../vocabulary/store/read.js';

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

/** The controlled sets, for the editor and for anything projecting to SKOS itself. */
router.get('/facets', authenticated, async (req, res, next) => {
    try {
        res.json(await listFacets());
    } catch (err) {
        next(err);
    }
});

export default router;
