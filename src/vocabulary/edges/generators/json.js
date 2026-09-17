/**
 * The edge definitions as omc-util's `edgeDefinitions`: one entry per OMC-JSON predicate, each
 * holding the domain → range groups it connects.
 *
 * ## What omc-util builds from this
 *
 * `buildEdgeTable` expands every group into the edge table each entityType carries, so this document
 * has to reproduce exactly what that function reads: `placement`, a def-level `inverse` with
 * group-level overrides, `path` or `pathTemplate`, `cardinality`, and an `rdf` that is a token here
 * because edges.js holds a function (`tentative`, `intrinsic`, or `const:<name>`). omc-util turns the
 * token back into the function when it bundles the document.
 *
 * An edge in the store is one relationship between two classes. Here it becomes up to two rows, one
 * per direction published to OMC-JSON, projected onto the OMC-JSON entityTypes of its ends. Several
 * RDF edges may project to the same row — `depictedBy` a Depiction and `realizedBy` a Realization
 * are both a Character's `realizedBy.Realization` — and those collapse into one.
 *
 * Deterministic: the same edges give the same document, in the order the edges were created.
 *
 * @module vocabulary/edges/generators/json
 */

import { DIRECTIONS, carries } from '../check.js';

/** A value's identity for grouping, where `null` and a string must stay distinct. */
const keyOf = ((value) => JSON.stringify(value ?? null));

/**
 * The value appearing most often, ties to the first seen.
 *
 * @param {Array<*>} values
 * @returns {*}
 */
function mostCommon(values) {
    const counts = new Map();
    values.forEach((value) => {
        const key = keyOf(value);
        const entry = counts.get(key) ?? { value, count: 0 };
        entry.count += 1;
        counts.set(key, entry);
    });
    return [...counts.values()].reduce((best, entry) => (entry.count > best.count ? entry : best)).value;
}

/**
 * The `rdf` token a row publishes: what edges.js held, or the edge's own RDF name in the edge
 * namespace.
 *
 * A direction that does not publish to RDF must not name a property the published RDF never
 * declares, so it takes the layer omc-util generates for itself instead — `intrinsic` for a named
 * property, `tentative` for anything else.
 *
 * @param {object} stored - One direction of an edge
 * @param {object} names - That direction's names
 * @param {object} settings
 * @returns {string}
 */
function rdfTokenOf(stored, names, settings) {
    const held = stored.legacy?.rdf ?? `const:${settings.rdf.prefix}:${names.rdfName?.value}`;
    if (stored.rdf?.include !== false || !held.startsWith('const:')) return held;
    return (names.placement?.value ?? 'edges') === 'property' ? 'intrinsic' : 'tentative';
}

/**
 * Every direction published to OMC-JSON, as a row.
 *
 * @param {object} ctx
 * @param {object} problems - Accumulates what could not be published
 * @returns {Array<object>}
 */
function rowsOf({ edges, index, settings }, problems) {
    const rows = [];
    edges.forEach((edge) => DIRECTIONS.filter(({ direction }) => carries(edge, direction))
        .forEach(({ direction, from, to }) => {
            const stored = edge[direction];
            if (!stored?.json?.include) return;
            const domain = index.classes.get(edge[from]?.term);
            const range = index.classes.get(edge[to]?.term);
            if (!domain?.jsonType || !range?.jsonType) {
                problems.skipped.push({ edgeId: edge._id, direction, reason: 'noProjection' });
                return;
            }
            const names = stored.names ?? {};
            const other = direction === 'forward' ? 'reverse' : 'forward';
            let inverse = null;
            if (stored.legacy && Object.hasOwn(stored.legacy, 'inverse')) {
                ({ inverse } = stored.legacy);
            } else if (carries(edge, other) && edge[other]?.json?.include) {
                inverse = edge[other]?.names?.predicate?.value ?? null;
            }
            rows.push({
                edgeId: edge._id,
                predicate: names.predicate?.value,
                placement: names.placement?.value ?? 'edges',
                path: names.path?.value ?? null,
                domain: domain.jsonType,
                range: range.jsonType,
                inverse,
                rdf: rdfTokenOf(stored, names, settings),
                cardinality: stored.legacy?.cardinality ?? 'array',
                rdfMap: stored.rdfMap ?? [],
            });
        }));
    return rows;
}

/**
 * How a row's path is stated to `buildEdgeTable`, which works an `edges` path out for itself and
 * defaults an intrinsic path to the predicate.
 *
 * @param {object} row
 * @param {object} problems
 * @returns {object} `{}`, `{ path }` or `{ pathTemplate }`
 */
function pathSpecOf(row, problems) {
    if (row.placement === 'edges') {
        if (row.path !== `edges.${row.predicate}.${row.range}`) {
            problems.unrepresentable.push({ edgeId: row.edgeId, reason: 'edgesPath', path: row.path });
        }
        return {};
    }
    if (!row.path || row.path === row.predicate) return {};
    if (row.path.endsWith(`.${row.range}`)) return { pathTemplate: `${row.path.slice(0, -row.range.length)}{range}` };
    return { path: row.path };
}

/**
 * The edge definitions document.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{body: object, problems: object}}
 */
export function toEdgeDefinitions(ctx) {
    const problems = { skipped: [], unrepresentable: [] };
    const byPredicate = new Map();

    rowsOf(ctx, problems).forEach((row) => {
        if (!byPredicate.has(row.predicate)) byPredicate.set(row.predicate, { placement: row.placement, rows: [] });
        const def = byPredicate.get(row.predicate);
        if (def.placement !== row.placement) {
            problems.unrepresentable.push({ edgeId: row.edgeId, reason: 'placement', predicate: row.predicate });
            return;
        }
        def.rows.push({ ...row, spec: pathSpecOf(row, problems) });
    });

    const edgeDefinitions = {};
    let rowCount = 0;
    byPredicate.forEach((def, predicate) => {
        const inverse = mostCommon(def.rows.map((row) => row.inverse));
        const rdf = mostCommon(def.rows.map((row) => row.rdf));
        const cardinality = mostCommon(def.rows.map((row) => row.cardinality));
        def.rows.filter((row) => row.rdf !== rdf)
            .forEach((row) => problems.unrepresentable.push({ edgeId: row.edgeId, reason: 'rdf', predicate, rdf: row.rdf }));
        def.rows.filter((row) => row.cardinality !== cardinality)
            .forEach((row) => problems.unrepresentable.push({ edgeId: row.edgeId, reason: 'cardinality', predicate }));
        const uniformSpec = new Set(def.rows.map((row) => keyOf(row.spec))).size === 1 ? def.rows[0].spec : null;

        // Rows sharing an inverse, a path and an alignment form a group; within one, each domain
        // keeps its ranges in the order they were created.
        const groups = new Map();
        def.rows.forEach((row) => {
            const spec = uniformSpec ? {} : row.spec;
            const key = keyOf([row.inverse, spec, row.rdfMap]);
            if (!groups.has(key)) {
                groups.set(key, {
                    inverse: row.inverse, spec, rdfMap: row.rdfMap, byDomain: new Map(),
                });
            }
            const ranges = groups.get(key).byDomain.get(row.domain) ?? [];
            if (!ranges.includes(row.range)) {
                ranges.push(row.range);
                rowCount += 1;
            }
            groups.get(key).byDomain.set(row.domain, ranges);
        });

        const connects = [];
        groups.forEach((group) => {
            // Domains with the same ranges share one entry, as a hand-written file would.
            const merged = new Map();
            group.byDomain.forEach((range, domain) => {
                const key = keyOf(range);
                if (!merged.has(key)) merged.set(key, { domain: [], range });
                merged.get(key).domain.push(domain);
            });
            merged.forEach(({ domain, range }) => {
                connects.push({
                    domain,
                    range,
                    ...(keyOf(group.inverse) !== keyOf(inverse) ? { inverse: group.inverse } : {}),
                    ...group.spec,
                    rdfMap: group.rdfMap,
                });
            });
        });

        edgeDefinitions[predicate] = {
            predicate,
            ...(def.placement === 'property' ? { placement: 'property' } : {}),
            ...(uniformSpec ?? {}),
            cardinality,
            inverse,
            rdf,
            connects,
        };
    });

    return {
        body: {
            generated: {
                format: 'omc-edge-definitions',
                version: 1,
                viewId: ctx.settings.viewId,
                edges: ctx.edges.length,
                rows: rowCount,
            },
            edgeDefinitions,
        },
        problems,
    };
}
