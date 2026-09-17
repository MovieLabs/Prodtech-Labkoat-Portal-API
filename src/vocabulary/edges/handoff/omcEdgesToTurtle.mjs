/**
 * Write OMC's edge properties and their SHACL usage shapes, from `omc-edges.json`.
 *
 * ```
 * node omcEdgesToTurtle.mjs omc-edges.json --out-dir ontology/
 * ```
 *
 * `omc-edges.json` is one document holding every projection of the edge definitions. This reads its
 * `rdf` section and ignores the rest; the `json` section is the OMC-JSON edge table, which another
 * build consumes. One file, so the two can never fall out of step.
 *
 * Writes `omc-edges.ttl` and `omc-edge-shapes.ttl`. Standalone and dependency-free, so it can be
 * copied into whichever repository builds the ontology and run as part of that build.
 *
 * ## What it writes, and why
 *
 * - **No `rdfs:domain`, no `rdfs:range`.** Both are inference rules, not restrictions: a property
 *   used on the wrong subject silently re-types that subject. A property says what it is for with
 *   `schema:domainIncludes` / `schema:rangeIncludes`, which infer nothing, and the SHACL shape
 *   enforces it.
 * - **A property per verb, with the specific ones beneath it.** `omc:featuresCharacter` is
 *   `rdfs:subPropertyOf omc:features`. The specific name carries the class it points at, which is
 *   what lets a shape say exactly where it belongs.
 * - **`owl:inverseOf` between verbs, once.** The specific names are not one-to-one in reverse —
 *   `featuresInNarrativeScene` answers `featuresCharacter` and `featuresEffect` alike — so asserting
 *   an inverse there would have a reasoner conclude those two are the same property.
 * - **An inverse expression where a verb cannot carry one.** A verb belonging to more than one pair
 *   states `rdfs:subPropertyOf [ owl:inverseOf … ]` on each specific property instead, which entails
 *   the reverse triple without asserting equivalence.
 *
 * Every one of those decisions is already made in the input: `verbs[].inverse` is present only where
 * a verb may carry it, and `properties[].inverseOf` only where it may not. This file writes what it
 * is given.
 *
 * @module omcEdgesToTurtle
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

/** Lower-case words from a property name: `usedByAsset` → `used by asset`. */
const words = ((name) => String(name).replace(/([a-z0-9])([A-Z])/g, '$1 $2').toLowerCase());

/** Escape a literal for Turtle. */
const escapeTurtle = ((value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t'));

const literal = ((value) => ({ value, language: 'en' }));

/**
 * One object, as Turtle: a reference, a blank node, a list, or a literal.
 *
 * @param {object} object
 * @returns {string}
 */
const turtleObject = ((object) => {
    if (object.node) {
        return `[ ${object.node.map((pair) => `${pair.predicate} ${turtleObject(pair.object)}`).join(' ; ')} ]`;
    }
    if (object.list) return `( ${object.list.map(turtleObject).join(' ')} )`;
    if (object.id) return object.id;
    return `"${escapeTurtle(object.value)}"${object.language ? `@${object.language}` : ''}`;
});

/**
 * Triples as a Turtle document, grouped by block and then by subject, so it reads as a document
 * rather than a triple dump.
 *
 * @param {Array<object>} triples
 * @param {{prefixes: Object<string, string>, blocks: Array<{name: string, title: string}>}} shape
 * @returns {string}
 */
function toTurtle(triples, { prefixes, blocks }) {
    const header = Object.entries(prefixes)
        .map(([prefix, uri]) => `@prefix ${prefix}: <${uri}> .`)
        .join('\n');

    const sections = blocks
        .map(({ name, title }) => ({ title, triples: triples.filter((one) => one.block === name) }))
        .filter((block) => block.triples.length)
        .map((block) => {
            const bySubject = new Map();
            block.triples.forEach((triple) => {
                if (!bySubject.has(triple.subject)) bySubject.set(triple.subject, []);
                bySubject.get(triple.subject).push(triple);
            });
            const subjects = [...bySubject.entries()].map(([subject, own]) => {
                const lines = own.map((triple) => `    ${triple.predicate} ${turtleObject(triple.object)}`);
                return `${subject}\n${lines.join(' ;\n')} .`;
            });
            return `#\n# ${block.title}\n#\n\n${subjects.join('\n\n')}`;
        });

    return `${header}\n\n${sections.join('\n\n')}\n`;
}

/** `sh:class` for one class, or `sh:or` over several. */
const classTest = ((ids) => (ids.length === 1
    ? [{ predicate: 'sh:class', object: { id: ids[0] } }]
    : [{
        predicate: 'sh:or',
        object: { list: ids.map((id) => ({ node: [{ predicate: 'sh:class', object: { id } }] })) },
    }]));

/**
 * The RDF section of the document, with the namespace it publishes under.
 *
 * @param {object} document - `omc-edges.json`
 * @returns {{prefix: string, base: string, verbs: Array<object>, properties: Array<object>}}
 */
const rdfOf = ((document) => ({
    prefix: document.namespace.prefix,
    base: document.namespace.base,
    verbs: document.rdf.verbs,
    properties: document.rdf.properties,
}));

/**
 * The property declarations.
 *
 * @param {object} document - `omc-edges.json`
 * @returns {string}
 */
export function owlTurtle(document) {
    const bundle = rdfOf(document);
    const { prefix, base } = bundle;
    const specificIds = new Set(bundle.properties.map((property) => property.id));

    const verbTriples = bundle.verbs.flatMap((verb) => {
        const add = ((predicate, object) => ({
            subject: verb.id, predicate, object, block: 'verbs',
        }));
        // A specific property that happens to share its verb's name is the verb property already.
        const named = specificIds.has(verb.id);
        return [
            ...(named ? [] : [add('rdf:type', { id: 'owl:ObjectProperty' })]),
            ...(verb.symmetric ? [add('rdf:type', { id: 'owl:SymmetricProperty' })] : []),
            ...(named ? [] : [add('rdfs:label', literal(words(verb.name)))]),
            ...(verb.definition ? [add('skos:definition', literal(verb.definition))] : []),
            ...(verb.inverse ? [add('owl:inverseOf', { id: verb.inverse })] : []),
        ];
    });

    const propertyTriples = bundle.properties.flatMap((property) => {
        const add = ((predicate, object) => ({
            subject: property.id, predicate, object, block: 'properties',
        }));
        return [
            add('rdf:type', { id: 'owl:ObjectProperty' }),
            add('rdfs:label', literal(words(property.name))),
            ...property.verbs
                .filter((verb) => verb !== property.id)
                .map((verb) => add('rdfs:subPropertyOf', { id: verb })),
            ...property.domains.map((id) => add('schema:domainIncludes', { id })),
            ...property.ranges.map((id) => add('schema:rangeIncludes', { id })),
            ...property.inverseOf.map((id) => add('rdfs:subPropertyOf', {
                node: [{ predicate: 'owl:inverseOf', object: { id } }],
            })),
        ];
    });

    return toTurtle([...verbTriples, ...propertyTriples], {
        prefixes: {
            [prefix]: base,
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
}

/**
 * The usage shapes.
 *
 * @param {object} document - `omc-edges.json`
 * @returns {string}
 */
export function shaclTurtle(document) {
    const bundle = rdfOf(document);
    const { prefix, base } = bundle;
    const triples = bundle.properties.flatMap((property) => {
        const subject = `${property.id}Shape`;
        const add = ((predicate, object) => ({
            subject, predicate, object, block: 'shapes',
        }));
        return [
            add('rdf:type', { id: 'sh:NodeShape' }),
            add('sh:targetSubjectsOf', { id: property.id }),
            add('rdfs:label', literal(`${words(property.name)} usage shape`)),
            ...classTest(property.domains).map(({ predicate, object }) => add(predicate, object)),
            add('sh:property', {
                node: [
                    { predicate: 'sh:path', object: { id: property.id } },
                    ...classTest(property.ranges),
                ],
            }),
        ];
    });

    return toTurtle(triples, {
        prefixes: {
            [prefix]: base,
            rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
            rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
            sh: 'http://www.w3.org/ns/shacl#',
        },
        blocks: [{ name: 'shapes', title: 'Where each edge property may be used, and what it points at' }],
    });
}

/**
 * Check the input is the document this writes from, rather than failing later and less clearly.
 *
 * @param {object} bundle
 * @throws {Error}
 */
export function checkBundle(document) {
    if (document?.generated?.format !== 'omc-edges') {
        const given = document?.generated?.format ?? 'no format';
        throw new Error(`Expected an "omc-edges" document, given "${given}". `
            + 'An older export named omc-edge-definitions.json holds the OMC-JSON edge table alone '
            + 'and cannot produce RDF: its domains and ranges are OMC-JSON entityTypes, with every '
            + 'subclass already folded into the class it projects to.');
    }
    if (!document.namespace?.prefix || !document.namespace?.base) throw new Error('The document names no RDF namespace');
    if (!Array.isArray(document.rdf?.properties) || !Array.isArray(document.rdf?.verbs)) {
        throw new Error('The document has no rdf section to write from');
    }
}

async function main() {
    const [source, ...rest] = process.argv.slice(2);
    if (!source) throw new Error('Usage: node omcEdgesToTurtle.mjs <omc-edges.json> [--out-dir <directory>]');
    const at = rest.indexOf('--out-dir');
    const outDir = at >= 0 ? rest[at + 1] : '.';

    const document = JSON.parse(await readFile(source, 'utf8'));
    checkBundle(document);

    await mkdir(outDir, { recursive: true });
    const written = [
        ['omc-edges.ttl', owlTurtle(document)],
        ['omc-edge-shapes.ttl', shaclTurtle(document)],
    ];
    await Promise.all(written.map(([name, body]) => writeFile(path.join(outDir, name), body, 'utf8')));

    written.forEach(([name, body]) => console.log(`Wrote ${path.join(outDir, name)} (${body.length} bytes)`));
    console.log(`${document.rdf.properties.length} properties under ${document.rdf.verbs.length} verbs, `
        + `from ${document.generated.viewId}`);
}

// Importing this file gets the functions; running it writes the files.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href) {
    main().catch((err) => {
        console.error(err.message);
        process.exit(1);
    });
}
