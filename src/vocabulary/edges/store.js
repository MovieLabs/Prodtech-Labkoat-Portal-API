/**
 * Reading and writing edge settings, predicate pairs and edges.
 *
 * Every write that changes names works them out here, from the pair and the two classes as the view
 * reads them now, so a client never generates a name and cannot send one that disagrees with the
 * rules. What a client sends for a name is only ever an override.
 *
 * @module vocabulary/edges/store
 */

import { toViewJson } from '../generators/json.js';
import { resolveView } from '../resolve.js';
import {
    VOCAB_EDGES, VOCAB_EDGE_PREDICATES, VOCAB_SETTINGS, vocabCollection,
} from '../store/collections.js';
import {
    ValidationError, basedOn, refuseAsStale, replaceUnchanged, stamped,
} from '../store/concurrency.js';
import { mintEdgeIds, mintPredicateIds } from '../store/ids.js';
import { oneLine } from '../store/normalise.js';
import {
    getTerms, listFacets, listViews,
} from '../store/read.js';
import { tagWords as tagWordsOf } from '../tags.js';

import { checkEdges, namesNow, basisOf, carries } from './check.js';
import { DEFAULT_CLASS_TAGS, classIndex } from './classes.js';
import { DEFAULT_TEMPLATES, NAME_FIELDS, applyNames } from './naming.js';
import { validateEdge, validatePair, validateSettings } from './validate.js';

const SETTINGS_ID = 'edges';

/** What the settings are before anybody has saved any. */
export const DEFAULT_SETTINGS = {
    _id: SETTINGS_ID,
    viewId: 'view:entity-structure',
    // Null reads every status, so a proposed class can take an edge before it is published.
    statuses: null,
    tagWords: DEFAULT_CLASS_TAGS,
    jsonNames: {},
    json: {
        edgesTemplate: DEFAULT_TEMPLATES.edgesTemplate,
        propertyTemplate: DEFAULT_TEMPLATES.propertyTemplate,
    },
    rdf: {
        prefix: 'omc',
        base: 'https://movielabs.com/omc/rdf/schema/v3.0#',
        template: DEFAULT_TEMPLATES.rdfTemplate,
    },
};

const text = ((value) => (value == null ? null : oneLine(value) || null));
const localisedText = ((field) => Object.fromEntries(Object.entries(field ?? {})
    .map(([language, value]) => [language, text(value)])
    .filter(([, value]) => value)));

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

/**
 * The edge settings, with defaults for anything not saved.
 *
 * @returns {Promise<object>}
 */
export async function getSettings() {
    const saved = await vocabCollection(VOCAB_SETTINGS).findOne({ _id: SETTINGS_ID });
    return {
        ...DEFAULT_SETTINGS,
        ...saved,
        tagWords: { ...DEFAULT_SETTINGS.tagWords, ...saved?.tagWords },
        json: { ...DEFAULT_SETTINGS.json, ...saved?.json },
        rdf: { ...DEFAULT_SETTINGS.rdf, ...saved?.rdf },
    };
}

/**
 * Save the edge settings.
 *
 * @param {object} input
 * @param {string} actor
 * @param {string} [expected] - The `modified` the caller read
 * @returns {Promise<{settings: object, warnings: string[]}>}
 * @throws {ValidationError|import('../store/concurrency.js').ConflictError}
 */
export async function saveSettings(input, actor, expected) {
    const settings = {
        _id: SETTINGS_ID,
        viewId: text(input.viewId),
        statuses: Array.isArray(input.statuses) && input.statuses.length ? input.statuses.map(text).filter(Boolean) : null,
        tagWords: Object.fromEntries(Object.keys(DEFAULT_CLASS_TAGS)
            .map((role) => [role, text(input.tagWords?.[role]) ?? DEFAULT_CLASS_TAGS[role]])),
        jsonNames: Object.fromEntries(Object.entries(input.jsonNames ?? {})
            .map(([termId, name]) => [text(termId), text(name)])
            .filter(([termId, name]) => termId && name)),
        json: {
            edgesTemplate: text(input.json?.edgesTemplate) ?? DEFAULT_TEMPLATES.edgesTemplate,
            propertyTemplate: text(input.json?.propertyTemplate) ?? DEFAULT_TEMPLATES.propertyTemplate,
        },
        rdf: {
            prefix: text(input.rdf?.prefix) ?? DEFAULT_SETTINGS.rdf.prefix,
            base: text(input.rdf?.base) ?? DEFAULT_SETTINGS.rdf.base,
            template: text(input.rdf?.template) ?? DEFAULT_TEMPLATES.rdfTemplate,
        },
    };

    const [views, facets] = await Promise.all([listViews(), listFacets()]);
    const checked = validateSettings(settings, {
        views: new Set(views.map((view) => view._id)),
        tagWords: new Set(tagWordsOf(facets).values()),
    });
    if (!checked.ok) throw new ValidationError(checked.errors);

    const next = stamped(settings, actor);
    const was = await vocabCollection(VOCAB_SETTINGS).findOne({ _id: SETTINGS_ID });
    if (!was) {
        await vocabCollection(VOCAB_SETTINGS).insertOne(next);
    } else {
        const written = await vocabCollection(VOCAB_SETTINGS).replaceOne(basedOn(SETTINGS_ID, expected), next);
        if (!written.matchedCount) await refuseAsStale(VOCAB_SETTINGS, SETTINGS_ID, 'edge settings');
    }
    return { settings: next, warnings: checked.warnings };
}

// ---------------------------------------------------------------------------
// The view the classes come from
// ---------------------------------------------------------------------------

/**
 * Everything a name or a check is worked out from: the settings, the classes as the view reads now,
 * the pairs, and the allowed statuses.
 *
 * @param {object} [overrides]
 * @param {Object<string, string>} [overrides.jsonNames] - OMC-JSON names laid over the saved ones, for a
 *   dry run that should not have to save them first
 * @returns {Promise<{settings: object, index: object, pairs: Map<string, object>, statuses: Set<string>, facets: Array<object>}>}
 */
export async function loadEdgeContext({ jsonNames } = {}) {
    const [saved, facets, pairList] = await Promise.all([getSettings(), listFacets(), listPairs()]);
    const settings = jsonNames ? { ...saved, jsonNames: { ...saved.jsonNames, ...jsonNames } } : saved;
    const statusFacet = facets.find((facet) => facet.appliesTo === 'status');
    const allStatuses = (statusFacet?.values ?? []).map((value) => value[statusFacet.key]);
    const resolution = await resolveView({ viewId: settings.viewId, status: settings.statuses ?? allStatuses });
    return {
        settings,
        facets,
        index: classIndex(toViewJson(resolution, facets), settings),
        pairs: new Map(pairList.map((pair) => [pair._id, pair])),
        statuses: new Set(allStatuses),
    };
}

// ---------------------------------------------------------------------------
// Predicate pairs
// ---------------------------------------------------------------------------

/** Every pair, by first verb. */
export const listPairs = (() => vocabCollection(VOCAB_EDGE_PREDICATES).find({}).sort({ 'forward.verb': 1 }).toArray());

/** One pair. */
export const getPair = ((id) => vocabCollection(VOCAB_EDGE_PREDICATES).findOne({ _id: id }));

/**
 * One side of a pair, tidied.
 *
 * @param {object} side
 * @returns {object|null}
 */
const normaliseSide = ((side) => (side
    ? {
        verb: text(side.verb),
        label: localisedText(side.label),
        definition: localisedText(side.definition),
        json: { placement: side.json?.placement === 'property' ? 'property' : 'edges', pathTemplate: text(side.json?.pathTemplate) },
        rdf: { template: text(side.rdf?.template) },
    }
    : null));

/**
 * A pair as it would be stored.
 *
 * @param {object} input
 * @returns {object}
 */
const normalisePair = ((input) => ({
    kind: input.kind,
    forward: normaliseSide(input.forward),
    reverse: input.kind === 'pair' ? normaliseSide(input.reverse) : null,
    status: text(input.status) ?? 'proposed',
    note: Array.isArray(input.note) ? input.note : [],
}));

/**
 * Create pairs.
 *
 * @param {Array<object>} inputs
 * @param {string} actor
 * @returns {Promise<Array<object>>}
 * @throws {ValidationError}
 */
export async function createPairs(inputs, actor) {
    if (!inputs.length) return [];
    const ids = await mintPredicateIds(inputs.length);
    const existing = await listPairs();
    const prepared = inputs.map((input, at) => stamped({ _id: ids[at], ...normalisePair(input) }, actor));
    const errors = prepared.flatMap((pair, at) => validatePair(pair, [...existing, ...prepared.filter((_, other) => other !== at)])
        .errors.map((message) => `${pair.forward?.verb ?? `Pair ${at + 1}`}: ${message}`));
    if (errors.length) throw new ValidationError(errors);
    await vocabCollection(VOCAB_EDGE_PREDICATES).insertMany(prepared);
    return prepared;
}

/**
 * Replace a pair. Edges using it are not rewritten: their names drift, and the check says so.
 *
 * @param {string} id
 * @param {object} input
 * @param {string} actor
 * @param {string} [expected]
 * @returns {Promise<object>}
 */
export async function replacePair(id, input, actor, expected) {
    const was = await getPair(id);
    if (!was) throw new ValidationError([`No such predicate pair: ${id}`]);
    if (expected && was.modified !== expected) await refuseAsStale(VOCAB_EDGE_PREDICATES, id, 'predicate pair');
    const next = stamped({ _id: id, ...normalisePair(input) }, actor);
    const checked = validatePair(next, await listPairs());
    if (!checked.ok) throw new ValidationError(checked.errors);
    await replaceUnchanged(VOCAB_EDGE_PREDICATES, was, next, 'predicate pair');
    return next;
}

/**
 * Delete a pair nothing uses.
 *
 * @param {string} id
 * @param {string} [expected]
 * @returns {Promise<void>}
 */
export async function deletePair(id, expected) {
    const using = await vocabCollection(VOCAB_EDGES).countDocuments({ pair: id });
    if (using) throw new ValidationError([`${using} edge(s) use this pair; change or delete them first`]);
    const gone = await vocabCollection(VOCAB_EDGE_PREDICATES).deleteOne(basedOn(id, expected));
    if (!gone.deletedCount) await refuseAsStale(VOCAB_EDGE_PREDICATES, id, 'predicate pair');
}

// ---------------------------------------------------------------------------
// Edges
// ---------------------------------------------------------------------------

/**
 * Edges, optionally only those touching a class or carrying a status.
 *
 * @param {object} [filter]
 * @param {string} [filter.term]
 * @param {string[]} [filter.status]
 * @returns {Promise<Array<object>>}
 */
export function listEdges({ term, status } = {}) {
    const query = {};
    if (term) query.$or = [{ 'domain.term': term }, { 'range.term': term }];
    if (status?.length) query.status = { $in: status };
    return vocabCollection(VOCAB_EDGES).find(query).sort({ _id: 1 }).toArray();
}

/** One edge. */
export const getEdge = ((id) => vocabCollection(VOCAB_EDGES).findOne({ _id: id }));

/**
 * One direction as a client sent it: whether it publishes, and any names typed by hand.
 *
 * @param {object} input
 * @returns {object}
 */
const normaliseDirection = ((input) => ({
    json: { include: input?.json?.include !== false },
    rdf: { include: input?.rdf?.include !== false },
    names: Object.fromEntries(NAME_FIELDS.map((field) => [field, { value: null, override: text(input?.names?.[field]?.override) }])),
    rdfMap: Array.isArray(input?.rdfMap) ? input.rdfMap.map(text).filter(Boolean) : [],
    ...(input?.legacy ? { legacy: input.legacy } : {}),
}));

/**
 * An edge as it would be stored, before its names are worked out.
 *
 * @param {object} input
 * @returns {object}
 */
const normaliseEdge = ((input) => ({
    pair: text(input.pair),
    domain: { term: text(input.domain?.term) },
    range: { term: text(input.range?.term) },
    forward: { mode: input.forward?.mode === 'none' ? 'none' : 'owned', ...normaliseDirection(input.forward) },
    reverse: { mode: input.reverse?.mode === 'none' ? 'none' : 'owned', ...normaliseDirection(input.reverse) },
    status: text(input.status) ?? 'proposed',
    note: Array.isArray(input.note) ? input.note : [],
    ...(input.source ? { source: input.source } : {}),
}));

/**
 * An edge with its names generated and its basis recorded.
 *
 * @param {object} edge
 * @param {object} ctx - From `loadEdgeContext`
 * @returns {object}
 */
export function withNames(edge, ctx) {
    const pair = ctx.pairs.get(edge.pair);
    const next = { ...edge };
    ['forward', 'reverse'].forEach((direction) => {
        if (!carries(edge, direction)) return;
        const generated = namesNow({
            edge, pair, direction, classes: ctx.index.classes, settings: ctx.settings,
        });
        if (generated) next[direction] = { ...edge[direction], names: applyNames(edge[direction].names, generated) };
    });
    next.basis = basisOf(edge, pair, ctx.index.classes);
    return next;
}

/**
 * What an edge a client is drawing would be called, and what saving it would be told — nothing is
 * written.
 *
 * @param {object} input - As a client would send it to create
 * @returns {Promise<{edge: object, errors: string[], warnings: string[]}>}
 */
export async function previewEdge(input) {
    const context = await loadEdgeContext();
    const edge = withNames(normaliseEdge(input), context);
    const checked = validateEdge(edge, {
        ...context, classes: context.index.classes, edges: await listEdges(),
    });
    return { edge, errors: checked.errors, warnings: checked.warnings };
}

/**
 * Refuse a batch whose validation found errors, naming each edge.
 *
 * @param {Array<object>} edges
 * @param {Array<object>} results
 */
function refuseInvalid(edges, results) {
    const errors = results.flatMap((checked, at) => checked.errors.map((message) => `Edge ${at + 1}: ${message}`));
    if (errors.length) throw new ValidationError(errors);
}

/**
 * Create edges.
 *
 * @param {Array<object>} inputs
 * @param {string} actor
 * @param {object} [ctx] - From `loadEdgeContext`, when the caller already holds one
 * @returns {Promise<{edges: Array<object>, warnings: string[]}>}
 */
export async function createEdges(inputs, actor, ctx = null) {
    if (!inputs.length) return { edges: [], warnings: [] };
    const context = ctx ?? await loadEdgeContext();
    const stored = await listEdges();
    const ids = await mintEdgeIds(inputs.length);
    const now = new Date().toISOString();
    const prepared = inputs.map((input, at) => stamped({
        _id: ids[at], ...withNames(normaliseEdge(input), context), created: now,
    }, actor));
    const results = prepared.map((edge, at) => validateEdge(edge, {
        ...context, classes: context.index.classes, edges: [...stored, ...prepared.filter((_, other) => other !== at)],
    }));
    refuseInvalid(prepared, results);
    await vocabCollection(VOCAB_EDGES).insertMany(prepared);
    return { edges: prepared, warnings: results.flatMap((checked) => checked.warnings) };
}

/**
 * Replace an edge, regenerating its names and keeping whatever overrides it sends.
 *
 * @param {string} id
 * @param {object} input
 * @param {string} actor
 * @param {string} [expected]
 * @returns {Promise<{edge: object, warnings: string[]}>}
 */
export async function replaceEdge(id, input, actor, expected) {
    const was = await getEdge(id);
    if (!was) throw new ValidationError([`No such edge: ${id}`]);
    if (expected && was.modified !== expected) await refuseAsStale(VOCAB_EDGES, id, 'edge');
    const context = await loadEdgeContext();
    const next = stamped({
        _id: id, ...withNames(normaliseEdge(input), context), created: was.created,
    }, actor);
    const checked = validateEdge(next, {
        ...context, classes: context.index.classes, edges: await listEdges(),
    }, was);
    refuseInvalid([next], [checked]);
    await replaceUnchanged(VOCAB_EDGES, was, next, 'edge');
    return { edge: next, warnings: checked.warnings };
}

/**
 * Delete an edge.
 *
 * @param {string} id
 * @param {string} [expected]
 * @returns {Promise<void>}
 */
export async function deleteEdge(id, expected) {
    const gone = await vocabCollection(VOCAB_EDGES).deleteOne(basedOn(id, expected));
    if (!gone.deletedCount) await refuseAsStale(VOCAB_EDGES, id, 'edge');
}

/**
 * Regenerate the names and basis of the given edges, keeping every override — what a person does
 * after reading the check and agreeing the vocabulary's change should carry through.
 *
 * @param {string[]} ids
 * @param {string} actor
 * @returns {Promise<Array<object>>}
 */
export async function acceptNames(ids, actor) {
    const context = await loadEdgeContext();
    const edges = await vocabCollection(VOCAB_EDGES).find({ _id: { $in: ids } }).toArray();
    const accepted = [];
    for (const was of edges) {
        const next = stamped(withNames(was, context), actor);
        await replaceUnchanged(VOCAB_EDGES, was, next, 'edge');
        accepted.push(next);
    }
    return accepted;
}

/**
 * The staleness report over every edge.
 *
 * @returns {Promise<object>} From `checkEdges`, with the context's class problems
 */
export async function edgeReport() {
    const [context, edges] = await Promise.all([loadEdgeContext(), listEdges()]);
    const ends = [...new Set(edges.flatMap((edge) => [edge.domain?.term, edge.range?.term]).filter(Boolean))];
    const terms = await getTerms(ends);
    return {
        ...checkEdges({
            edges, pairs: context.pairs, settings: context.settings, index: context.index, terms,
        }),
        context,
        edges,
    };
}
