/**
 * Seeding edge definitions from omc-util's hand-written edges.js, once.
 *
 * Pure: `seedFromOmcUtil.js` loads edges.js by path and the classes from the store, and this works out
 * what to write and what it could not reconcile. Nothing here writes.
 *
 * ## Reproduce edges.js exactly, then fix it in the open
 *
 * The first publish has to build omc-util's edge table exactly as edges.js does, faults included, so
 * that swapping the hand file for the published one changes nothing and every later correction is a
 * diff somebody reviewed. So a direction keeps whatever edges.js said about it that the pair model
 * does not explain — its raw `inverse`, its `rdf` token, a cardinality other than `array` — under
 * `legacy`, and a name that differs from what its pair would generate becomes an override.
 *
 * ## From predicates to pairs
 *
 * edges.js states each direction as a row of its own and names the other by `inverse`. Two rows
 * joining the same classes the other way round are one edge when either names the other's path.
 * Rows that name each other are joined first, so a row only takes one that does not name it back
 * once nothing agrees with it; such an edge is marked for review. A verb pairs with the verb it
 * agrees with first, and belongs to that pair only. A named-property verb (`Director`) joins the pair
 * of the edge verb it is the inverse of (`for`) as an override rather than claiming a pair of its own.
 *
 * @module vocabulary/edges/seed
 */

import { generateNames } from './naming.js';

/**
 * Where a reference is stored. Follows omc-util's `buildEdgeTable` `computePath`, since the rows here
 * must carry the paths that function builds.
 */
const computePath = ((placement, predicate, range, group, def) => {
    if (placement === 'edges') return `edges.${predicate}.${range}`;
    if (group.path) return group.path;
    if (def.path) return def.path;
    const template = group.pathTemplate || def.pathTemplate;
    if (template) return template.replace('{predicate}', predicate).replace('{range}', range);
    return predicate;
});

/** An inverse name as the path it resolves to. Follows `buildEdgeTable`'s `resolveInversePath`. */
const resolveInversePath = ((definitions, inverse, originDomain) => {
    if (!inverse) return null;
    const inverseDef = definitions[inverse];
    const placement = inverseDef ? inverseDef.placement || 'edges' : 'edges';
    if (placement === 'edges') return `edges.${inverse}.${originDomain}`;
    return (inverseDef && inverseDef.path) || inverse;
});

/**
 * Every entityType edges.js names, as a domain or a range.
 *
 * @param {Object<string, object>} definitions
 * @returns {Set<string>}
 */
export function entityTypesOf(definitions) {
    const types = new Set();
    Object.values(definitions).forEach((def) => def.connects
        .forEach((group) => [...group.domain, ...group.range].forEach((type) => types.add(type))));
    return types;
}

/**
 * Every directed row edges.js states, in the order it states them.
 *
 * @param {Object<string, object>} definitions
 * @param {{tentativeRdf: Function, intrinsicRdf: Function}} rdfFunctions - edges.js's two templates, to
 *   recognise which a definition uses
 * @returns {Array<object>}
 */
export function expandRows(definitions, { tentativeRdf, intrinsicRdf }) {
    const rows = [];
    Object.entries(definitions).forEach(([key, def]) => {
        const placement = def.placement || 'edges';
        const tokenOf = ((args) => {
            if (typeof def.rdf !== 'function' || def.rdf === tentativeRdf) return 'tentative';
            if (def.rdf === intrinsicRdf) return 'intrinsic';
            return `const:${def.rdf(args)}`;
        });
        def.connects.forEach((group, groupIndex) => {
            const inverse = Object.hasOwn(group, 'inverse') ? group.inverse : def.inverse;
            const template = group.pathTemplate || def.pathTemplate;
            const perRange = placement === 'edges' || (!!template && template.includes('{range}'));
            group.domain.forEach((domain) => group.range.forEach((range) => {
                const pathRange = perRange ? range : group.range[0];
                rows.push({
                    seq: rows.length,
                    key,
                    predicate: def.predicate ?? key,
                    placement,
                    domain,
                    range,
                    path: computePath(placement, key, pathRange, group, def),
                    inverse: inverse ?? null,
                    inversePath: resolveInversePath(definitions, inverse, domain),
                    rdf: tokenOf({ domain, predicate: key, range: pathRange }),
                    cardinality: def.cardinality ?? 'array',
                    rdfMap: group.rdfMap ?? [],
                    group: groupIndex,
                });
            }));
        });
    });
    return rows;
}

/**
 * Rows joined into edges: a row and the row going back between the same classes that it names, or
 * that names it — agreeing rows first.
 *
 * @param {Array<object>} rows
 * @returns {Array<{rows: [object, object|null], mutual: boolean}>}
 */
export function joinRows(rows) {
    const used = new Set();
    const joined = [];
    const back = ((row, other) => other.seq !== row.seq && !used.has(other.seq)
        && other.domain === row.range && other.range === row.domain);
    const join = ((row, other, mutual) => {
        used.add(row.seq);
        if (other) used.add(other.seq);
        joined.push({ row, other, mutual });
    });

    rows.forEach((row) => {
        if (used.has(row.seq)) return;
        // A symmetric row between a class and itself is its own inverse.
        if (row.domain === row.range && row.inversePath === row.path) {
            used.add(row.seq);
            joined.push({ row, other: row, mutual: true });
            return;
        }
        const agreeing = rows.find((other) => back(row, other)
            && row.inversePath === other.path && other.inversePath === row.path);
        if (agreeing) join(row, agreeing, true);
    });
    rows.forEach((row) => {
        if (used.has(row.seq)) return;
        const claimed = rows.find((other) => back(row, other)
            && (row.inversePath === other.path || other.inversePath === row.path));
        join(row, claimed ?? null, false);
    });

    return joined
        .sort((a, b) => a.row.seq - b.row.seq)
        .map(({ row, other, mutual }) => ({ rows: [row, other], mutual }));
}

/**
 * The predicate pairs the joined rows imply.
 *
 * @param {Array<object>} joined - From `joinRows`
 * @returns {{pairs: Array<object>, pairOfVerb: Map<string, object>, inferences: Array<object>}}
 */
export function registerPairs(joined) {
    const pairs = [];
    const pairOfVerb = new Map();
    const inferences = [];
    const free = ((verb) => !pairOfVerb.has(verb));
    const side = ((row) => ({ verb: row.predicate, json: { placement: row.placement } }));
    const create = ((kind, forward, reverse) => {
        const pair = {
            key: `p${pairs.length + 1}`, kind, forward: side(forward), reverse: kind === 'pair' ? side(reverse) : null,
        };
        pairs.push(pair);
        pairOfVerb.set(forward.predicate, pair);
        if (kind === 'pair') pairOfVerb.set(reverse.predicate, pair);
        return pair;
    });
    const bothWays = ((first, second) => [[first, second], [second, first]]
        .filter(([row, other]) => row && other !== row));

    // Agreed edge verbs first, in the order edges.js states them.
    joined.filter((edge) => edge.mutual).forEach(({ rows: [forward, reverse] }) => {
        if (forward.placement !== 'edges' || reverse.placement !== 'edges') return;
        if (forward.predicate === reverse.predicate) {
            if (free(forward.predicate)) create('symmetric', forward, null);
            return;
        }
        if (free(forward.predicate) && free(reverse.predicate)) create('pair', forward, reverse);
    });

    // An edge verb whose inverse is a named property pairs with it; any other takes a pair alone.
    joined.forEach(({ rows: [first, second] }) => {
        if (first === second && first.placement === 'edges' && free(first.predicate)) create('symmetric', first, null);
        bothWays(first, second).forEach(([row, other]) => {
            if (row.placement !== 'edges' || !free(row.predicate)) return;
            if (other && other.placement === 'property' && free(other.predicate)) {
                create('pair', row, other);
                return;
            }
            create('none', row, null);
        });
    });

    // A named-property verb joins the pair of the verb it is the inverse of.
    joined.forEach(({ rows: [first, second] }) => bothWays(first, second).forEach(([row, other]) => {
        if (row.placement !== 'property' || !free(row.predicate)) return;
        if (other && pairOfVerb.has(other.predicate)) {
            if (!inferences.some((one) => one.verb === row.predicate && one.onto === other.predicate)) {
                inferences.push({ verb: row.predicate, onto: other.predicate });
            }
            return;
        }
        if (other && other.placement === 'property' && free(other.predicate) && other.predicate !== row.predicate) {
            create('pair', row, other);
            return;
        }
        create('none', row, null);
    }));

    return { pairs, pairOfVerb, inferences };
}

/**
 * Which pair an edge takes, and which of its rows is the pair's forward direction.
 *
 * @param {{rows: [object, object|null]}} edge
 * @param {Map<string, object>} pairOfVerb
 * @returns {{pair: object, forwardRow: object|null, reverseRow: object|null}}
 */
function orient({ rows: [first, second] }, pairOfVerb) {
    if (first === second) return { pair: pairOfVerb.get(first.predicate), forwardRow: first, reverseRow: second };
    const direct = pairOfVerb.get(first.predicate);
    const pair = direct ?? pairOfVerb.get(second?.predicate);
    const swap = pair.kind === 'pair' && (direct
        ? pair.forward.verb !== first.predicate && pair.reverse.verb === first.predicate
        : pair.forward.verb === second.predicate);
    return swap
        ? { pair, forwardRow: second ?? null, reverseRow: first }
        : { pair, forwardRow: first, reverseRow: second ?? null };
}

/**
 * Work out every pair and edge to write.
 *
 * @param {object} params
 * @param {Object<string, object>} params.definitions - edges.js's `edgeDefinitions`
 * @param {{tentativeRdf: Function, intrinsicRdf: Function}} params.rdfFunctions
 * @param {Map<string, object>} params.classes - From `classIndex`
 * @param {object} params.settings - The edge settings
 * @returns {{pairs: Array<object>, edges: Array<object>, report: object}}
 */
export function planSeed({
    definitions, rdfFunctions, classes, settings,
}) {
    const rows = expandRows(definitions, rdfFunctions);
    const joined = joinRows(rows);
    const { pairs, pairOfVerb, inferences } = registerPairs(joined);

    // OMC-JSON entityType → the class carrying the JSON-Entity mark for it.
    const typeIds = new Map();
    classes.forEach((entry) => {
        if (entry.jsonTerm === entry.id && entry.jsonType) typeIds.set(entry.jsonType, entry.id);
    });

    const report = {
        rows: rows.length,
        joined: joined.length,
        agreed: 0,
        oneSided: [],
        unanswered: [],
        unmatchedTypes: new Set(),
        unmatchedRows: 0,
        inferences,
        overrides: 0,
        duplicates: [],
    };
    const edges = [];
    const identities = new Map();
    // A constant path does not name the range, so rows differing only by range would read the same.
    const describe = ((row) => `${row.domain}.${row.path}${row.path.endsWith(`.${row.range}`) ? '' : ` → ${row.range}`}`);

    joined.forEach((edge) => {
        const { pair, forwardRow, reverseRow } = orient(edge, pairOfVerb);
        const [first, second] = edge.rows;
        const domainType = forwardRow ? forwardRow.domain : reverseRow.range;
        const rangeType = forwardRow ? forwardRow.range : reverseRow.domain;
        const domainId = typeIds.get(domainType);
        const rangeId = typeIds.get(rangeType);
        if (!domainId) report.unmatchedTypes.add(domainType);
        if (!rangeId) report.unmatchedTypes.add(rangeType);
        if (!domainId || !rangeId) {
            report.unmatchedRows += first === second || !second ? 1 : 2;
            return;
        }

        if (edge.mutual) report.agreed += 1;
        else if (second) report.oneSided.push(`${describe(first)} ↔ ${describe(second)}`);
        else if (first.inverse != null) report.unanswered.push(`${describe(first)} names inverse ${JSON.stringify(first.inverse)}`);

        const ends = {
            forward: { from: classes.get(domainId), to: classes.get(rangeId) },
            reverse: { from: classes.get(rangeId), to: classes.get(domainId) },
        };
        const sideFor = ((direction) => (direction === 'forward' || pair.kind === 'symmetric' ? pair.forward : pair.reverse));
        const rowFor = { forward: forwardRow, reverse: reverseRow };

        const directionOf = ((direction) => {
            const row = rowFor[direction];
            const other = rowFor[direction === 'forward' ? 'reverse' : 'forward'];
            if (!row) {
                // Stated only from the other side. Carried for RDF where the pair has an inverse and
                // edges.js named one; never written to OMC-JSON, which never had it.
                const carried = pair.kind !== 'none' && other?.inverse != null;
                return {
                    mode: carried ? 'owned' : 'none', json: { include: false }, rdf: { include: carried }, names: {}, rdfMap: [],
                };
            }
            const generated = generateNames({
                side: sideFor(direction), domain: ends[direction].from, range: ends[direction].to, settings,
            });
            const names = {};
            const override = ((field, value) => {
                if (value === generated[field]) return;
                names[field] = { override: value };
                report.overrides += 1;
            });
            override('placement', row.placement);
            override('predicate', row.predicate);
            override('path', row.path);
            // A name somebody chose in edges.js, in this namespace, is kept. Its templated names — the
            // tentative layer and the intrinsic `has<Predicate>` — are generated afresh instead.
            const constant = `const:${settings.rdf.prefix}:`;
            if (row.rdf.startsWith(constant)) override('rdfName', row.rdf.slice(constant.length));

            // The inverse the published document would derive: the other direction's predicate.
            const derivedInverse = other ? other.predicate : null;
            return {
                mode: 'owned',
                json: { include: true },
                rdf: { include: true },
                names,
                rdfMap: row.rdfMap,
                legacy: {
                    rdf: row.rdf,
                    ...(row.cardinality !== 'array' ? { cardinality: row.cardinality } : {}),
                    ...(row.inverse !== derivedInverse ? { inverse: row.inverse } : {}),
                },
            };
        });

        const forward = directionOf('forward');
        const reverse = directionOf('reverse');
        const unexplained = [forward, reverse].some((one) => one.legacy && Object.hasOwn(one.legacy, 'inverse'));
        const identity = [pair.key, domainId, rangeId, forwardRow?.predicate ?? '', reverseRow?.predicate ?? ''].join('|');
        if (identities.has(identity)) {
            report.duplicates.push(`${describe(first)} repeats ${identities.get(identity)}`);
            return;
        }
        identities.set(identity, describe(first));

        edges.push({
            pairKey: pair.key,
            domain: { term: domainId },
            range: { term: rangeId },
            forward,
            reverse,
            status: edge.mutual && !unexplained ? 'proposed' : 'review',
            note: [],
            source: {
                from: 'omc-util src/templates/v3-0/edges.js',
                rows: [...new Set(edge.rows.filter(Boolean))].map((row) => ({ predicate: row.key, group: row.group })),
            },
        });
    });

    report.unmatchedTypes = [...report.unmatchedTypes].sort();
    return { pairs, edges, report };
}
