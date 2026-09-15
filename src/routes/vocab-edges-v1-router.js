/**
 * `/api/vocab/v1` — the edge definitions beside the vocabulary: settings, predicate pairs, edges,
 * the check of both against the entity structure, and publishing them.
 *
 * Mounted beside `vocab-v1-router` under the same path and the same guards, so a build that holds
 * the vocabulary's read credential can fetch the published edges with it. Fixed paths are registered
 * before `/:id`, which would otherwise match them.
 *
 * @module routes/vocab-edges-v1-router
 */

import express from 'express';

import { edgeFormats, generateEdges, isEdgeFormat } from '../vocabulary/edges/generators/index.js';
import { describeEdgeProblem } from '../vocabulary/edges/problems.js';
import {
    acceptNames,
    createEdges,
    createPairs,
    deleteEdge,
    deletePair,
    edgeReport,
    getEdge,
    getPair,
    getSettings,
    listEdges,
    listPairs,
    loadEdgeContext,
    previewEdge,
    replaceEdge,
    replacePair,
    saveSettings,
} from '../vocabulary/edges/store.js';
import { VOCAB_EDGES, vocabCollection } from '../vocabulary/store/collections.js';

import {
    actorOf, authenticated, basedOnOf, statusFrom, writeFailed,
} from './vocabGuards.js';

const router = express.Router();

/** A body that may be one record or several, as a list. */
const asList = ((body) => (Array.isArray(body) ? body : [body]));

/**
 * A label for a class or term id, for problem sentences.
 *
 * @param {Map<string, object>} classes
 * @returns {function(string): string}
 */
const labelFrom = ((classes) => ((id) => classes.get(id)?.label ?? id));

// ---------------------------------------------------------------------------
// Settings and classes
// ---------------------------------------------------------------------------

router.get('/edge-settings', authenticated, async (req, res, next) => {
    try {
        res.json(await getSettings());
    } catch (err) {
        next(err);
    }
});

router.put('/edge-settings', authenticated, async (req, res, next) => {
    try {
        res.json(await saveSettings(req.body ?? {}, await actorOf(req), basedOnOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/**
 * The classes an edge may join, as the configured view reads now, with the relationships the
 * structure already gives them.
 */
router.get('/edge-classes', authenticated, async (req, res, next) => {
    try {
        const { settings, index } = await loadEdgeContext();
        res.json({
            viewId: settings.viewId,
            classes: [...index.classes.values()],
            structural: index.structural,
            problems: index.problems,
        });
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// Predicate pairs
// ---------------------------------------------------------------------------

router.get('/edge-predicates', authenticated, async (req, res, next) => {
    try {
        const [pairs, usage] = await Promise.all([
            listPairs(),
            vocabCollection(VOCAB_EDGES).aggregate([{ $group: { _id: '$pair', count: { $sum: 1 } } }]).toArray(),
        ]);
        const counts = new Map(usage.map((row) => [row._id, row.count]));
        res.json(pairs.map((pair) => ({ ...pair, usage: counts.get(pair._id) ?? 0 })));
    } catch (err) {
        next(err);
    }
});

router.post('/edge-predicates', authenticated, async (req, res, next) => {
    try {
        res.status(201).json(await createPairs(asList(req.body ?? []), await actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

router.get('/edge-predicates/:id', authenticated, async (req, res, next) => {
    try {
        const pair = await getPair(req.params.id);
        if (!pair) {
            res.status(404).json({ message: `No such predicate pair: ${req.params.id}` });
            return;
        }
        res.json(pair);
    } catch (err) {
        next(err);
    }
});

router.put('/edge-predicates/:id', authenticated, async (req, res, next) => {
    try {
        res.json(await replacePair(req.params.id, req.body ?? {}, await actorOf(req), basedOnOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

router.delete('/edge-predicates/:id', authenticated, async (req, res, next) => {
    try {
        await deletePair(req.params.id, basedOnOf(req));
        res.status(204).end();
    } catch (err) {
        writeFailed(err, res, next);
    }
});

// ---------------------------------------------------------------------------
// Edges — fixed paths first
// ---------------------------------------------------------------------------

router.get('/edges', authenticated, async (req, res, next) => {
    try {
        const term = typeof req.query.term === 'string' ? req.query.term : undefined;
        res.json(await listEdges({ term, status: statusFrom(req.query) }));
    } catch (err) {
        next(err);
    }
});

router.post('/edges', authenticated, async (req, res, next) => {
    try {
        res.status(201).json(await createEdges(asList(req.body ?? []), await actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** What an edge would be called, and what saving it would be told. Writes nothing. */
router.post('/edges/preview', authenticated, async (req, res, next) => {
    try {
        res.json(await previewEdge(req.body ?? {}));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

/** Every edge the vocabulary has moved out from under, with a sentence for each problem. */
router.get('/edges/check', authenticated, async (req, res, next) => {
    try {
        const report = await edgeReport();
        const labelOf = labelFrom(report.context.index.classes);
        const described = ((list) => list.map((problem) => ({ ...problem, message: describeEdgeProblem(problem, labelOf) })));
        res.json({
            summary: report.summary,
            byEdge: Object.fromEntries(Object.entries(report.byEdge).map(([id, list]) => [id, described(list)])),
            byTerm: Object.fromEntries(Object.entries(report.byTerm).map(([id, list]) => [id, described(list)])),
            classes: report.classes,
        });
    } catch (err) {
        next(err);
    }
});

/** Regenerate names for the edges named in `{ ids }`, keeping every override. */
router.post('/edges/accept', authenticated, async (req, res, next) => {
    try {
        const ids = Array.isArray(req.body?.ids) ? req.body.ids.filter((id) => typeof id === 'string') : [];
        res.json(await acceptNames(ids, await actorOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

router.get('/edges/formats', authenticated, (req, res) => {
    res.json(edgeFormats());
});

router.get('/edges/publish', authenticated, async (req, res, next) => {
    try {
        const format = typeof req.query.format === 'string' ? req.query.format : 'json';
        if (!isEdgeFormat(format)) {
            res.status(400).json({ message: `No such format: ${format}`, formats: edgeFormats().map((one) => one.format) });
            return;
        }
        const artifact = await generateEdges({ format, status: statusFrom(req.query) });
        const counts = Object.entries(artifact.problems ?? {})
            .map(([key, value]) => [key, Array.isArray(value) ? value.length : value])
            .filter(([, value]) => value);
        if (counts.length) res.set('X-Vocab-Problems', counts.map(([key, value]) => `${key}=${value}`).join('; '));
        res.set('Content-Type', artifact.contentType);
        res.set('Content-Disposition', `attachment; filename="${artifact.filename}"`);
        res.send(typeof artifact.body === 'string' || Buffer.isBuffer(artifact.body)
            ? artifact.body
            : JSON.stringify(artifact.body, null, 2));
    } catch (err) {
        next(err);
    }
});

// ---------------------------------------------------------------------------
// One edge
// ---------------------------------------------------------------------------

router.get('/edges/:id', authenticated, async (req, res, next) => {
    try {
        const edge = await getEdge(req.params.id);
        if (!edge) {
            res.status(404).json({ message: `No such edge: ${req.params.id}` });
            return;
        }
        res.json(edge);
    } catch (err) {
        next(err);
    }
});

router.put('/edges/:id', authenticated, async (req, res, next) => {
    try {
        res.json(await replaceEdge(req.params.id, req.body ?? {}, await actorOf(req), basedOnOf(req)));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

router.delete('/edges/:id', authenticated, async (req, res, next) => {
    try {
        await deleteEdge(req.params.id, basedOnOf(req));
        res.status(204).end();
    } catch (err) {
        writeFailed(err, res, next);
    }
});

router.post('/edges/:id/accept', authenticated, async (req, res, next) => {
    try {
        const [edge] = await acceptNames([req.params.id], await actorOf(req));
        if (!edge) {
            res.status(404).json({ message: `No such edge: ${req.params.id}` });
            return;
        }
        res.json(edge);
    } catch (err) {
        writeFailed(err, res, next);
    }
});

export default router;
