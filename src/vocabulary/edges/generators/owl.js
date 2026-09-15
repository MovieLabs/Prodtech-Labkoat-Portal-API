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

    const verbProperty = ((pair, direction) => {
        const side = sideOf(pair, direction);
        if (!side?.verb) return null;
        const id = `${prefix}:${lowerFirst(side.verb)}`;
        if (!verbs.has(id)) {
            const other = direction === 'forward' ? sideOf(pair, 'reverse') : pair.forward;
            verbs.set(id, {
                id,
                name: lowerFirst(side.verb),
                definition: side.definition?.en ?? null,
                symmetric: pair.kind === 'symmetric',
                inverse: pair.kind === 'pair' && other?.verb ? `${prefix}:${lowerFirst(other.verb)}` : null,
            });
        }
        return id;
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
        });
    });

    const verbConflicts = [...properties.values()]
        .filter((property) => property.verbs.size > 1)
        .map((property) => ({ property: property.id, verbs: sorted(property.verbs) }));

    return {
        properties: [...properties.values()].sort((a, b) => a.name.localeCompare(b.name)),
        verbs: [...verbs.values()].sort((a, b) => a.name.localeCompare(b.name)),
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
