/**
 * What edge settings, predicate pairs and edges must satisfy before they are written.
 *
 * Errors refuse the write; warnings allow it and say something. An edge the vocabulary has since
 * moved out from under can still be saved — its notes or status edited, or its ends changed to fix
 * it — so what the check reports as an error on a stored edge is only an error here when the save
 * is what introduces it.
 *
 * @module vocabulary/edges/validate
 */

import { fail, result } from '../store/validate.js';

import { carries } from './check.js';
import { isEdgeClass } from './classes.js';
import { PLACEMENTS } from './naming.js';

/** The kinds of predicate pair. */
export const PAIR_KINDS = ['pair', 'symmetric', 'none'];

/** What each direction of an edge can be: carried by it, or not. */
export const DIRECTION_MODES = ['owned', 'none'];

/** A verb is one camelCase word, so it can stand in a JSON key and an RDF local name. */
const VERB = /^[A-Za-z][A-Za-z0-9]*$/;

/**
 * Check the edge settings.
 *
 * @param {object} settings
 * @param {object} known
 * @param {Set<string>} known.views - View ids
 * @param {Set<string>} known.tagWords - Every tag word the tag list holds
 * @returns {import('../store/validate.js').ValidationResult}
 */
export function validateSettings(settings, { views, tagWords }) {
    const found = result();
    if (!views.has(settings.viewId)) fail(found, `No such view: ${settings.viewId}`);
    Object.entries(settings.tagWords ?? {}).forEach(([role, word]) => {
        if (!tagWords.has(word)) found.warnings.push(`The ${role} tag "${word}" is not in the tag list`);
    });
    Object.entries(settings.jsonNames ?? {}).forEach(([termId, name]) => {
        if (!/^[A-Z][A-Za-z0-9]*$/.test(String(name))) fail(found, `"${name}" for ${termId} is not a PascalCase name`);
    });
    if (!settings.rdf?.prefix || !/^[a-z][a-zA-Z0-9]*$/.test(settings.rdf.prefix)) {
        fail(found, 'The RDF prefix must be a lowercase word');
    }
    if (!/^https?:\/\/\S+[#/]$/.test(String(settings.rdf?.base ?? ''))) {
        fail(found, 'The RDF namespace must be an http(s) IRI ending in # or /');
    }
    return found;
}

/**
 * Check one side of a pair.
 *
 * @param {object} into
 * @param {object} side
 * @param {string} which
 */
function checkSide(into, side, which) {
    if (!side?.verb) {
        fail(into, `The ${which} verb is missing`);
        return;
    }
    if (!VERB.test(side.verb)) fail(into, `"${side.verb}" is not one camelCase word`);
    if (side.json?.placement && !PLACEMENTS.includes(side.json.placement)) {
        fail(into, `"${side.json.placement}" is not a placement (${PLACEMENTS.join(', ')})`);
    }
}

/**
 * Check a predicate pair.
 *
 * **A verb may belong to several pairs**, warned about rather than refused. What must not happen is
 * one published property acquiring two inverses, which is a fact about the edges drawn on those pairs
 * — `checkEdges` reports it and the export says so, neither of them refusing an edit made on the way
 * there.
 *
 * @param {object} pair - As it would be stored
 * @param {Array<object>} others - Every other pair
 * @returns {import('../store/validate.js').ValidationResult}
 */
export function validatePair(pair, others) {
    const found = result();
    if (!PAIR_KINDS.includes(pair.kind)) fail(found, `"${pair.kind}" is not a kind of pair (${PAIR_KINDS.join(', ')})`);
    checkSide(found, pair.forward, 'forward');
    if (pair.kind === 'pair') {
        checkSide(found, pair.reverse, 'reverse');
        if (pair.reverse?.verb && pair.reverse.verb === pair.forward?.verb) {
            fail(found, 'A pair\'s two verbs must differ; make it symmetric instead');
        }
    } else if (pair.reverse) {
        fail(found, `A ${pair.kind} pair has no reverse verb`);
    }

    // A verb may pair with more than one other — `usedBy` against `realizedBy` for a Realization and
    // against `depictedBy` for a Depiction. The properties those publish are named for the class they
    // point at, so they stay distinct; what cannot be shared is one property having two inverses, and
    // that depends on the edges rather than the pairs. `checkEdges` reports it, and the RDF generator
    // states the inverse between the specific properties instead of between the verbs.
    const verbs = [pair.forward?.verb, pair.reverse?.verb].filter(Boolean);
    others.filter((other) => other._id !== pair._id).forEach((other) => {
        [other.forward?.verb, other.reverse?.verb].filter(Boolean).forEach((verb) => {
            if (verbs.includes(verb)) {
                found.warnings.push(`"${verb}" also belongs to ${other._id}; their inverses are stated per property, not per verb`);
            }
        });
    });
    return found;
}

/**
 * The predicate a direction publishes, or null when the edge does not carry it.
 *
 * @param {object} edge
 * @param {'forward'|'reverse'} direction
 * @returns {string|null}
 */
const predicateOf = ((edge, direction) => (carries(edge, direction) ? edge[direction]?.names?.predicate?.value ?? null : null));

/**
 * Check an edge.
 *
 * @param {object} edge - As it would be stored, names generated
 * @param {object} ctx
 * @param {Map<string, object>} ctx.classes - From `classIndex`
 * @param {Map<string, object>} ctx.pairs - By id
 * @param {Array<object>} ctx.edges - Every stored edge
 * @param {Set<string>} ctx.statuses - Allowed status values
 * @param {object} [stored] - The edge as stored, when this replaces one
 * @returns {import('../store/validate.js').ValidationResult}
 */
export function validateEdge(edge, {
    classes, pairs, edges, statuses,
}, stored = null) {
    const found = result();
    // A problem the save does not introduce is reported, not refused.
    const refuseOrWarn = ((introduced, message) => (introduced ? fail(found, message) : found.warnings.push(message)));

    ['domain', 'range'].forEach((end) => {
        const termId = edge[end]?.term;
        if (!termId) {
            fail(found, `The ${end} class is missing`);
            return;
        }
        const changed = stored?.[end]?.term !== termId;
        const entry = classes.get(termId);
        if (!entry) refuseOrWarn(changed, `${termId} is not a class in the entity structure`);
        else if (!isEdgeClass(entry)) refuseOrWarn(changed, `"${entry.label}" is not tagged as an entity or an abstract class`);
    });

    ['forward', 'reverse'].forEach((direction) => {
        if (!DIRECTION_MODES.includes(edge[direction]?.mode)) fail(found, `"${edge[direction]?.mode}" is not a ${direction} mode`);
    });
    if (!carries(edge, 'forward') && !carries(edge, 'reverse')) fail(found, 'An edge must carry at least one direction');

    const pair = pairs.get(edge.pair);
    if (!pair) {
        fail(found, `No such predicate pair: ${edge.pair}`);
    } else if (carries(edge, 'reverse') && pair.kind === 'none') {
        fail(found, 'This pair declares no inverse, so the edge cannot carry a reverse direction');
    }
    if (edge.status && !statuses.has(edge.status)) fail(found, `"${edge.status}" is not a status`);

    ['forward', 'reverse'].filter((direction) => carries(edge, direction)).forEach((direction) => {
        if (!edge[direction]?.json?.include) return;
        const ends = direction === 'forward' ? ['domain', 'range'] : ['range', 'domain'];
        ends.forEach((end) => {
            const entry = classes.get(edge[end]?.term);
            if (entry && !entry.jsonType) {
                found.warnings.push(`"${entry.label}" has no OMC-JSON entity above it, so the ${direction} direction publishes to RDF only`);
            }
        });
    });

    // Two edges between the same classes may share a pair when they publish different predicates —
    // Slate `has` Participant, and Slate `Director`, which names that relationship more narrowly.
    const duplicate = edges.find((other) => other._id !== edge._id && other.pair === edge.pair
        && other.domain?.term === edge.domain?.term && other.range?.term === edge.range?.term
        && predicateOf(other, 'forward') === predicateOf(edge, 'forward')
        && predicateOf(other, 'reverse') === predicateOf(edge, 'reverse'));
    if (duplicate) fail(found, `Edge ${duplicate._id} already joins these classes with these predicates`);

    return found;
}
