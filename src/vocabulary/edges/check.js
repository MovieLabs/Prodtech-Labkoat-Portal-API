/**
 * Which edge definitions the vocabulary has moved out from under.
 *
 * The edges and the vocabulary are edited independently, and an edge names its two classes by term
 * id only. So nothing stops a class being deleted, untagged, moved or renamed while edges still
 * point at it — deliberately: tying the two together would make every vocabulary edit wait on the
 * edges. This asks afterwards instead, and says what each edge would need.
 *
 * Pure: every input is passed in, so the same report is produced by the route, the CLI and a test.
 *
 * @module vocabulary/edges/check
 */

import { isEdgeClass } from './classes.js';
import { generateNames, namesDrift } from './naming.js';

/**
 * @typedef {object} EdgeProblem
 * @property {string} code
 * @property {'error'|'warning'|'info'} level
 * @property {string} edgeId
 * @property {string} [termId]
 * @property {'domain'|'range'} [end]
 * @property {'forward'|'reverse'} [direction]
 * @property {boolean} [fixable] - Accepting the generated names clears it
 */

/** The two directions of an edge, and which end each one starts and finishes at. */
export const DIRECTIONS = [
    { direction: 'forward', from: 'domain', to: 'range' },
    { direction: 'reverse', from: 'range', to: 'domain' },
];

/**
 * The side of a predicate pair a direction reads its verb from.
 *
 * A symmetric pair names one verb for both directions.
 *
 * @param {object} pair
 * @param {'forward'|'reverse'} direction
 * @returns {object|null}
 */
export const sideOf = ((pair, direction) => {
    if (direction === 'forward') return pair?.forward ?? null;
    if (pair?.kind === 'symmetric') return pair.forward;
    return pair?.reverse ?? null;
});

/**
 * Whether an edge carries a direction at all.
 *
 * Usually both, or only the forward one. Only the reverse is possible too: a relationship stated
 * solely by the verb a pair calls its reverse.
 *
 * @param {object} edge
 * @param {'forward'|'reverse'} direction
 * @returns {boolean}
 */
export const carries = ((edge, direction) => (edge[direction]?.mode ?? (direction === 'forward' ? 'owned' : 'none')) === 'owned');

/**
 * What the names of one direction would be now.
 *
 * @param {object} params
 * @param {object} params.edge
 * @param {object} params.pair
 * @param {'forward'|'reverse'} params.direction
 * @param {Map<string, object>} params.classes - From `classIndex`
 * @param {object} params.settings
 * @returns {object|null} From `generateNames`, or null when a class or the pair is missing
 */
export function namesNow({
    edge, pair, direction, classes, settings,
}) {
    const { from, to } = DIRECTIONS.find((entry) => entry.direction === direction);
    const side = sideOf(pair, direction);
    const domain = classes.get(edge[from]?.term);
    const range = classes.get(edge[to]?.term);
    if (!side || !domain || !range) return null;
    return generateNames({
        side, domain, range, settings,
    });
}

/**
 * The basis an edge's names are generated from, as it stands now.
 *
 * Stored on the edge whenever its names are generated, so a later check can say what moved.
 *
 * @param {object} edge
 * @param {object} pair
 * @param {Map<string, object>} classes
 * @returns {object}
 */
export function basisOf(edge, pair, classes) {
    const end = ((id) => {
        const entry = classes.get(id);
        return entry
            ? {
                label: entry.label, name: entry.name, jsonTerm: entry.jsonTerm, jsonType: entry.jsonType,
            }
            : null;
    });
    return {
        domain: end(edge.domain?.term),
        range: end(edge.range?.term),
        pairModified: pair?.modified ?? null,
    };
}

/**
 * Check every edge against the vocabulary as it stands.
 *
 * @param {object} params
 * @param {Array<object>} params.edges
 * @param {Map<string, object>} params.pairs - By id
 * @param {object} params.settings
 * @param {{classes: Map<string, object>, structural: Array<object>, problems: Array<object>}} params.index - From `classIndex`
 * @param {Map<string, object>} params.terms - Every endpoint term the store holds, by id, whether or not the view places it
 * @returns {{summary: {error: number, warning: number, info: number}, byEdge: Object<string, EdgeProblem[]>,
 *   byTerm: Object<string, EdgeProblem[]>, classes: Array<object>}}
 */
export function checkEdges({
    edges, pairs, settings, index, terms,
}) {
    const { classes } = index;
    const found = [];
    const report = ((problem) => found.push(problem));

    edges.forEach((edge) => {
        const pair = pairs.get(edge.pair);

        ['domain', 'range'].forEach((end) => {
            const termId = edge[end]?.term;
            const base = {
                edgeId: edge._id, termId, end,
            };
            if (!terms.has(termId)) {
                report({ ...base, code: 'missingTerm', level: 'error' });
                return;
            }
            if (terms.get(termId).status === 'deprecated') {
                report({ ...base, code: 'deprecatedTerm', level: 'warning' });
            }
            const entry = classes.get(termId);
            if (!entry) {
                report({ ...base, code: 'notInView', level: 'error' });
                return;
            }
            if (!isEdgeClass(entry)) {
                report({
                    ...base, code: 'untagged', level: 'error', role: entry.role,
                });
            }
            const was = edge.basis?.[end];
            if (!was) return;
            if ((was.jsonTerm ?? null) !== (entry.jsonTerm ?? null)) {
                report({
                    ...base, code: 'projectionChanged', level: 'warning', was: was.jsonType, now: entry.jsonType,
                });
            }
            if (was.label !== entry.label) {
                report({
                    ...base, code: 'classRenamed', level: 'warning', was: was.label, now: entry.label,
                });
            }
        });

        if (!pair) {
            report({ edgeId: edge._id, code: 'pairMissing', level: 'error' });
            return;
        }
        if (edge.basis?.pairModified && edge.basis.pairModified !== pair.modified) {
            report({ edgeId: edge._id, code: 'pairChanged', level: 'warning' });
        }

        DIRECTIONS.filter(({ direction }) => carries(edge, direction)).forEach(({ direction, from, to }) => {
            const stored = edge[direction] ?? {};
            if (stored.json?.include) {
                [from, to].forEach((end) => {
                    const entry = classes.get(edge[end]?.term);
                    if (entry && !entry.jsonType) {
                        report({
                            edgeId: edge._id, termId: entry.id, end, direction, code: 'noProjection', level: 'error',
                        });
                    }
                });
            }
            if (stored.legacy?.inverse !== undefined) {
                report({
                    edgeId: edge._id, direction, code: 'legacyInverse', level: 'info', inverse: stored.legacy.inverse,
                });
            }
            const generated = namesNow({
                edge, pair, direction, classes, settings,
            });
            if (!generated) return;
            namesDrift(stored.names, generated).forEach((drift) => report({
                edgeId: edge._id,
                direction,
                code: drift.overridden ? 'overriddenName' : 'namesDrifted',
                level: drift.overridden ? 'info' : 'warning',
                fixable: !drift.overridden,
                ...drift,
            }));
        });
    });

    crossEdgeProblems({
        edges, index, pairs,
    }).forEach(report);

    const summary = { error: 0, warning: 0, info: 0 };
    const byEdge = {};
    const byTerm = {};
    found.forEach((problem) => {
        summary[problem.level] += 1;
        (byEdge[problem.edgeId] ??= []).push(problem);
        if (problem.termId) (byTerm[problem.termId] ??= []).push(problem);
    });
    return {
        summary, byEdge, byTerm, classes: index.problems,
    };
}

/**
 * Problems no single edge has on its own: two edges publishing the same thing differently, and an
 * edge that repeats one the structure or an ancestor already gives.
 *
 * @param {object} params
 * @param {Array<object>} params.edges
 * @param {object} params.index
 * @param {Map<string, object>} params.pairs
 * @returns {EdgeProblem[]}
 */
function crossEdgeProblems({ edges, index, pairs }) {
    const { classes, structural } = index;
    const problems = [];

    // One OMC-JSON path on one entityType, from edges whose inverses disagree, cannot both be written.
    const jsonRows = new Map();
    // One RDF property name meaning two different relationships.
    const rdfNames = new Map();

    edges.forEach((edge) => {
        DIRECTIONS.filter(({ direction }) => carries(edge, direction)).forEach(({ direction, from, to }) => {
            const stored = edge[direction] ?? {};
            const other = direction === 'forward' ? 'reverse' : 'forward';
            const inversePath = carries(edge, other) && edge[other]?.json?.include
                ? edge[other]?.names?.path?.value ?? null
                : null;
            const domainType = classes.get(edge[from]?.term)?.jsonType;
            const path = stored.names?.path?.value;
            if (stored.json?.include && domainType && path) {
                const key = `${domainType}|${path}`;
                if (!jsonRows.has(key)) jsonRows.set(key, []);
                jsonRows.get(key).push({ edgeId: edge._id, inversePath, rangeType: classes.get(edge[to]?.term)?.jsonType });
            }
            const rdfName = stored.names?.rdfName?.value;
            if (stored.rdf?.include !== false && rdfName) {
                // A symmetric pair means the same thing in both directions.
                const meaning = pairs.get(edge.pair)?.kind === 'symmetric' ? edge.pair : `${edge.pair}|${direction}`;
                if (!rdfNames.has(rdfName)) rdfNames.set(rdfName, []);
                rdfNames.get(rdfName).push({ edgeId: edge._id, meaning });
            }
        });
    });

    jsonRows.forEach((rows, key) => {
        const inverses = new Set(rows.map((row) => row.inversePath ?? ''));
        if (inverses.size < 2) return;
        rows.forEach((row) => problems.push({
            edgeId: row.edgeId, code: 'jsonCollision', level: 'error', key, others: rows.map((r) => r.edgeId),
        }));
    });

    rdfNames.forEach((uses, name) => {
        if (new Set(uses.map((use) => use.meaning)).size < 2) return;
        const edgeIds = [...new Set(uses.map((use) => use.edgeId))];
        edgeIds.forEach((edgeId) => problems.push({
            edgeId, code: 'rdfConflict', level: 'warning', rdfName: name, others: edgeIds,
        }));
    });

    const structuralBetween = new Map();
    structural.forEach((entry) => structuralBetween.set(`${entry.domain}|${entry.range}`, entry));
    edges.forEach((edge) => {
        const ends = [[edge.domain?.term, edge.range?.term], [edge.range?.term, edge.domain?.term]];
        ends.forEach(([a, b]) => {
            const entry = structuralBetween.get(`${a}|${b}`);
            if (entry) {
                problems.push({
                    edgeId: edge._id, code: 'structuralDuplicate', level: 'warning', structural: entry.name,
                });
            }
        });
    });

    // The same pair already joins an ancestor of each end, so this edge is inherited as it stands.
    const selfAndAncestors = ((id) => [id, ...(classes.get(id)?.ancestors ?? [])]);
    const byPair = new Map();
    edges.forEach((edge) => {
        if (!byPair.has(edge.pair)) byPair.set(edge.pair, []);
        byPair.get(edge.pair).push(edge);
    });
    edges.forEach((edge) => {
        const domains = new Set(selfAndAncestors(edge.domain?.term));
        const ranges = new Set(selfAndAncestors(edge.range?.term));
        const covering = (byPair.get(edge.pair) ?? []).find((other) => other._id !== edge._id
            && domains.has(other.domain?.term) && ranges.has(other.range?.term)
            && !(other.domain?.term === edge.domain?.term && other.range?.term === edge.range?.term));
        if (covering) {
            problems.push({
                edgeId: edge._id, code: 'redundantInherited', level: 'info', coveredBy: covering._id,
            });
        }
    });

    return problems;
}
