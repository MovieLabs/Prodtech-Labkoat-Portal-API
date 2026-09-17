/**
 * The edge definitions as RDF: object property declarations, and the SHACL shapes that say where
 * each may be used.
 *
 * ## Declarations never infer; shapes restrict
 *
 * The conventions are the RDF build's (`RDF-Testing/README.md`, decision 7), so these two files load
 * beside its package as more of the same ontology. `rdfs:domain` and `rdfs:range` look like
 * restrictions but are inference rules — a property used on the wrong subject silently re-types it —
 * so neither is emitted. A property says what it is for with `schema:domainIncludes` and
 * `schema:rangeIncludes`, which infer nothing, and a usage shape enforces it: the subject must be
 * one of the classes the property is placed on, and the object must be one of the classes it points
 * at. `sh:class` follows `rdfs:subClassOf` in the data graph, so a subclass passes where its
 * superclass is named.
 *
 * ## Inverses are stated between verbs
 *
 * An edge property is named for its verb and the class it points at — `featuresCharacter`,
 * `featuresInNarrativeScene` — which is what lets a shape say exactly where it belongs. That naming
 * is not one-to-one in reverse: `featuresInNarrativeScene` answers `featuresCharacter` and
 * `featuresEffect` alike, and stating `owl:inverseOf` there would make a reasoner conclude those two
 * are the same property. So each specific property is `rdfs:subPropertyOf` a property for its verb,
 * and `owl:inverseOf` (or `owl:SymmetricProperty`) is stated once, between the verbs — the pattern the
 * RDF build uses for `has<Entity>Name` under `hasEntityName`. A verb property carries no usage hints,
 * so it needs no shape.
 *
 * A verb may belong to several pairs — `usedBy` against `realizedBy` for one class and `depictedBy`
 * for another. Its verb property then cannot carry the inverse, since two `owl:inverseOf` statements
 * about one property say those two verbs are the same property. Such pairs point each specific
 * property at an inverse **expression** instead:
 *
 * ```turtle
 * omc:usedByCharacter rdfs:subPropertyOf [ owl:inverseOf omc:realizedByRealization ] .
 * ```
 *
 * which entails the reverse triple without asserting that anything is equivalent — so one property
 * may answer several others, and nothing about that is a defect to report.
 *
 * **An intrinsic pair states no inverse at all.** It names a property of an entity in OMC-JSON, and
 * its reverse verb is a field name rather than a relationship RDF makes; pairing the two would put a
 * JSON artefact in the ontology. Its properties are still declared and still carry their shapes.
 *
 * @module vocabulary/edges/generators/owl
 */

import { toTurtle } from '../../generators/rdfSerialise.js';
import { DIRECTIONS, carries, sideOf } from '../check.js';

/** Lower-case words from a property name: `usedByAsset` → `used by asset`. */
const words = ((name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());

const lowerFirst = ((word) => word.charAt(0).toLowerCase() + word.slice(1));

const literal = ((value) => ({ value, language: 'en' }));

const sorted = ((set) => [...set].sort());

/**
 * Every RDF property the edges publish, merged across the edges that use each name, and the verb
 * properties they sit under.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{properties: Array<object>, verbs: Array<object>, skipped: Array<object>, verbConflicts: Array<object>}}
 */
export function edgeProperties({
    edges, pairs, index, settings,
}) {
    const { prefix } = settings.rdf;
    const properties = new Map();
    const verbs = new Map();
    const skipped = [];

    const pairsPerVerb = new Map();
    [...pairs.values()].forEach((pair) => {
        ['forward', 'reverse'].forEach((direction) => {
            const verb = sideOf(pair, direction)?.verb;
            if (!verb) return;
            const held = pairsPerVerb.get(lowerFirst(verb)) ?? new Set();
            held.add(pair._id);
            pairsPerVerb.set(lowerFirst(verb), held);
        });
    });
    // A pair declaring no inverse has no reverse side, so the verb asked for is often absent — and a
    // verb nothing names is not shared with anything.
    const verbAlone = ((verb) => (verb ? (pairsPerVerb.get(lowerFirst(verb))?.size ?? 0) < 2 : true));

    // Which pairs may state `owl:inverseOf` between their verbs.
    //
    // **A verb may appear in at most one such statement.** Two of them about one verb have a reasoner
    // conclude its two partners are the same property: three pairs naming `usedBy` would collapse
    // `realizedBy`, `depictedBy` and `portrayedBy` into one. Everything else states the entailment on
    // the specific properties instead, which says the same thing without asserting equivalence.
    //
    // A verb commonly serves several pairs in different roles — `usedIn` is the reverse of `uses` and
    // the forward of three more — and that reverse is the one genuine pair among them. So the question
    // is asked per role, and then checked: any verb still named twice loses the statement everywhere,
    // which is what keeps a crossed pair from slipping through.
    const asserting = (() => {
        const candidates = [...pairs.values()]
            .filter((pair) => pair.kind === 'pair' && pair.forward?.verb && pair.reverse?.verb
                && pair.forward?.json?.placement !== 'property')
            .map((pair) => ({
                id: pair._id,
                forward: lowerFirst(pair.forward.verb),
                reverse: lowerFirst(pair.reverse.verb),
            }));

        const tally = ((list) => list.reduce((held, verb) => held.set(verb, (held.get(verb) ?? 0) + 1), new Map()));
        const asForward = tally(candidates.map((one) => one.forward));
        const asReverse = tally(candidates.map((one) => one.reverse));

        const inRole = candidates.filter((one) => asForward.get(one.forward) === 1 && asReverse.get(one.reverse) === 1);

        // A verb still named twice here leads one pair and answers another — `usedIn` answering
        // `uses` while leading `usedIn ↔ depictionOf`. The pair it answers is the reciprocal one, so
        // that keeps the statement and the pair it leads gives it up.
        const named = tally(inRole.flatMap((one) => [one.forward, one.reverse]));
        const twice = new Set([...named.entries()].filter(([, count]) => count > 1).map(([verb]) => verb));
        const kept = inRole.filter((one) => !twice.has(one.forward));

        // Whatever survives, no verb may be named more than once: that is the whole safety condition.
        const remaining = tally(kept.flatMap((one) => [one.forward, one.reverse]));
        return new Set(kept
            .filter((one) => remaining.get(one.forward) === 1 && remaining.get(one.reverse) === 1)
            .map((one) => one.id));
    })();

    const verbProperty = ((pair, direction) => {
        const side = sideOf(pair, direction);
        if (!side?.verb) return null;
        const id = `${prefix}:${lowerFirst(side.verb)}`;
        if (!verbs.has(id)) {
            const other = direction === 'forward' ? sideOf(pair, 'reverse') : pair.forward;
            // An intrinsic pair names a property of an entity in OMC-JSON. Its reverse verb is a
            // field name — `RealizationOf`, `AssetStructure` — not a relationship RDF states, so
            // pairing the two here would put a JSON artefact in the ontology.
            const intrinsic = pair.forward?.json?.placement === 'property';
            verbs.set(id, {
                id,
                name: lowerFirst(side.verb),
                definition: side.definition?.en ?? null,
                symmetric: pair.kind === 'symmetric' && verbAlone(side.verb) && !intrinsic,
                inverse: asserting.has(pair._id) && other?.verb ? `${prefix}:${lowerFirst(other.verb)}` : null,
            });
        }
        return id;
    });

    /** The inverse each specific property takes, where its verb cannot carry one. */
    const inverses = new Map();
    const noteInverse = ((from, to) => {
        if (!inverses.has(from)) inverses.set(from, new Set());
        inverses.get(from).add(to);
    });

    edges.forEach((edge) => {
        const pair = pairs.get(edge.pair);
        DIRECTIONS.filter(({ direction }) => carries(edge, direction)).forEach(({ direction, from, to }) => {
            const stored = edge[direction];
            if (stored?.rdf?.include === false) return;
            const name = stored?.names?.rdfName?.value;
            const domain = index.classes.get(edge[from]?.term);
            const range = index.classes.get(edge[to]?.term);
            if (!name || !domain || !range || !pair) {
                skipped.push({ edgeId: edge._id, direction });
                return;
            }
            const id = `${prefix}:${name}`;
            if (!properties.has(id)) {
                properties.set(id, {
                    id, name, domains: new Set(), ranges: new Set(), verbs: new Set(),
                });
            }
            const property = properties.get(id);
            property.domains.add(`${prefix}:${domain.name}`);
            property.ranges.add(`${prefix}:${range.name}`);
            const verb = verbProperty(pair, direction);
            if (verb) property.verbs.add(verb);

            // Both directions of one edge are each other's inverse. Stated here only where the verbs
            // cannot state it, and only between names that answer each other one to one.
            const other = direction === 'forward' ? 'reverse' : 'forward';
            const otherName = carries(edge, other) && edge[other]?.rdf?.include !== false
                ? edge[other]?.names?.rdfName?.value
                : null;
            // Whatever the verbs could not state, the properties do.
            const intrinsic = pair.forward?.json?.placement === 'property';
            const stated = asserting.has(pair._id);
            if (otherName && pair.kind === 'pair' && !stated && !intrinsic) noteInverse(id, `${prefix}:${otherName}`);
        });
    });

    // A property may answer more than one other — `usedByCharacter` answering both `realizedBy` and
    // `depictedBy` — and each is stated as its own inverse expression. Nothing is dropped, and there
    // is nothing left to report: it is only `owl:inverseOf` that cannot be said twice.
    const propertyInverses = [...inverses.entries()]
        .flatMap(([from, to]) => sorted(to).map((one) => ({ from, to: one })));

    const verbConflicts = [...properties.values()]
        .filter((property) => property.verbs.size > 1)
        .map((property) => ({ property: property.id, verbs: sorted(property.verbs) }));

    return {
        properties: [...properties.values()].sort((a, b) => a.name.localeCompare(b.name)),
        verbs: [...verbs.values()].sort((a, b) => a.name.localeCompare(b.name)),
        propertyInverses: propertyInverses.sort((a, b) => a.from.localeCompare(b.from)),
        skipped,
        verbConflicts,
    };
}

/**
 * `sh:class` for one class, or `sh:or` over several.
 *
 * @param {string[]} ids
 * @returns {Array<{predicate: string, object: object}>}
 */
const classTest = ((ids) => (ids.length === 1
    ? [{ predicate: 'sh:class', object: { id: ids[0] } }]
    : [{
        predicate: 'sh:or',
        object: { list: ids.map((id) => ({ node: [{ predicate: 'sh:class', object: { id } }] })) },
    }]));

/**
 * What the generators could not publish, keyed as the export's problems header reports them.
 *
 * @param {object} found - From `edgeProperties`
 * @returns {object}
 */
const problemsOf = (({ skipped, verbConflicts }) => ({
    ...(skipped.length ? { skipped } : {}),
    ...(verbConflicts.length ? { verbConflicts } : {}),
}));

/**
 * The declarations document.
 *
 * @param {object} ctx
 * @returns {{body: string, problems: object}}
 */
export function toOwlTurtle(ctx) {
    const found = edgeProperties(ctx);
    const specificIds = new Set(found.properties.map((property) => property.id));

    const verbTriples = found.verbs
        // A specific property that happens to share its verb's name is the verb property already.
        .flatMap((verb) => {
            const add = ((predicate, object) => ({
                subject: verb.id, predicate, object, block: 'verbs',
            }));
            return [
                ...(specificIds.has(verb.id) ? [] : [add('rdf:type', { id: 'owl:ObjectProperty' })]),
                ...(verb.symmetric ? [add('rdf:type', { id: 'owl:SymmetricProperty' })] : []),
                ...(specificIds.has(verb.id) ? [] : [add('rdfs:label', literal(words(verb.name)))]),
                ...(verb.definition ? [add('skos:definition', literal(verb.definition))] : []),
                ...(verb.inverse ? [add('owl:inverseOf', { id: verb.inverse })] : []),
            ];
        });

    const propertyTriples = found.properties.flatMap((property) => {
        const add = ((predicate, object) => ({
            subject: property.id, predicate, object, block: 'properties',
        }));
        return [
            add('rdf:type', { id: 'owl:ObjectProperty' }),
            add('rdfs:label', literal(words(property.name))),
            ...sorted(property.verbs)
                .filter((verb) => verb !== property.id)
                .map((verb) => add('rdfs:subPropertyOf', { id: verb })),
            ...sorted(property.domains).map((id) => add('schema:domainIncludes', { id })),
            ...sorted(property.ranges).map((id) => add('schema:rangeIncludes', { id })),
            ...found.propertyInverses
                .filter((one) => one.from === property.id)
                .map((one) => add('rdfs:subPropertyOf', {
                    node: [{ predicate: 'owl:inverseOf', object: { id: one.to } }],
                })),
        ];
    });

    const body = toTurtle([...verbTriples, ...propertyTriples], {
        prefixes: {
            [ctx.settings.rdf.prefix]: ctx.settings.rdf.base,
            owl: 'http://www.w3.org/2002/07/owl#',
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            schema: 'https://schema.org/',
            skos: 'http://www.w3.org/2004/02/skos/core#',
        },
        blocks: [
            { name: 'verbs', title: 'Verbs — each edge property below is a sub-property of one; inverses are stated here' },
            { name: 'properties', title: 'Edge properties — declarations only; omc-edge-shapes.ttl says where each may be used' },
        ],
    });
    return { body, problems: problemsOf(found) };
}

/**
 * The usage shapes document.
 *
 * @param {object} ctx
 * @returns {{body: string, problems: object}}
 */
export function toShaclTurtle(ctx) {
    const found = edgeProperties(ctx);
    const triples = found.properties.flatMap((property) => {
        const subject = `${property.id}Shape`;
        const add = ((predicate, object) => ({
            subject, predicate, object, block: 'shapes',
        }));
        return [
            add('rdf:type', { id: 'sh:NodeShape' }),
            add('sh:targetSubjectsOf', { id: property.id }),
            add('rdfs:label', literal(`${words(property.name)} usage shape`)),
            ...classTest(sorted(property.domains)).map(({ predicate, object }) => add(predicate, object)),
            add('sh:property', {
                node: [
                    { predicate: 'sh:path', object: { id: property.id } },
                    ...classTest(sorted(property.ranges)),
                ],
            }),
        ];
    });
    const body = toTurtle(triples, {
        prefixes: {
            [ctx.settings.rdf.prefix]: ctx.settings.rdf.base,
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            sh: 'http://www.w3.org/ns/shacl#',
        },
        blocks: [{ name: 'shapes', title: 'Where each edge property may be used, and what it points at' }],
    });
    return { body, problems: problemsOf(found) };
}
