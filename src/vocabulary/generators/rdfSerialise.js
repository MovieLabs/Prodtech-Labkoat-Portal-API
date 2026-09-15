/**
 * Writing triples out as Turtle or JSON-LD.
 *
 * Every RDF document this service publishes is built as a list of triples and encoded here, so the
 * two encodings of one document cannot disagree. A generator supplies its own prefix map and the
 * blocks its document is written in; nothing here knows what the triples mean.
 *
 * @module vocabulary/generators/rdfSerialise
 */

/**
 * @typedef {object} Triple
 * @property {string} subject - A prefixed id
 * @property {string} predicate - A prefixed predicate
 * @property {object} object - `{ id }` for a reference, `{ union: [ids] }` for an anonymous class
 *   that is the union of several, or `{ value, language }` for a literal
 * @property {string} block - The block of the document it is written in
 */

/**
 * @typedef {object} DocumentShape
 * @property {Object<string, string>} prefixes - CURIE prefix → the IRI it expands to
 * @property {Array<{name: string, title: string}>} blocks - In the order they are written
 */

/** Escape a literal for Turtle. */
const escapeTurtle = ((value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t'));

/**
 * Group triples by subject, keeping the order each subject was first seen.
 *
 * @param {Triple[]} triples
 * @returns {Map<string, Triple[]>}
 */
function bySubject(triples) {
    const grouped = new Map();
    triples.forEach((triple) => {
        if (!grouped.has(triple.subject)) grouped.set(triple.subject, []);
        grouped.get(triple.subject).push(triple);
    });
    return grouped;
}

/**
 * The triples of each block, in the order the blocks are written, skipping any that is empty.
 *
 * @param {Triple[]} triples
 * @param {Array<{name: string, title: string}>} blocks
 * @returns {Array<{title: string, triples: Triple[]}>}
 */
const inBlocks = ((triples, blocks) => blocks
    .map(({ name, title }) => ({ title, triples: triples.filter((one) => one.block === name) }))
    .filter((block) => block.triples.length));

/**
 * One object, as Turtle.
 *
 * @param {object} object
 * @returns {string}
 */
const turtleObject = ((object) => {
    if (object.union) return `[ a owl:Class ; owl:unionOf ( ${object.union.join(' ')} ) ]`;
    if (object.node) {
        return `[ ${object.node.map((pair) => `${pair.predicate} ${turtleObject(pair.object)}`).join(' ; ')} ]`;
    }
    if (object.list) return `( ${object.list.map(turtleObject).join(' ')} )`;
    if (object.id) return object.id;
    return `"${escapeTurtle(object.value)}"${object.language ? `@${object.language}` : ''}`;
});

/**
 * One object, as JSON-LD.
 *
 * @param {object} object
 * @returns {object}
 */
const jsonLdObject = ((object) => {
    if (object.union) {
        return {
            '@type': 'owl:Class',
            'owl:unionOf': { '@list': object.union.map((id) => ({ '@id': id })) },
        };
    }
    if (object.node) {
        return object.node.reduce((node, pair) => {
            if (pair.predicate === 'rdf:type') {
                node['@type'] = [...(node['@type'] ?? []), pair.object.id];
            } else {
                node[pair.predicate] = [...(node[pair.predicate] ?? []), jsonLdObject(pair.object)];
            }
            return node;
        }, {});
    }
    if (object.list) return { '@list': object.list.map(jsonLdObject) };
    if (object.id) return { '@id': object.id };
    return { '@value': object.value, '@language': object.language };
});

/**
 * Turtle.
 *
 * @param {Triple[]} triples
 * @param {DocumentShape} shape
 * @returns {string}
 */
export function toTurtle(triples, { prefixes, blocks }) {
    const header = Object.entries(prefixes)
        .map(([prefix, uri]) => `@prefix ${prefix}: <${uri}> .`)
        .join('\n');

    // Grouped by block, then by subject, so the output reads as a document rather than a triple
    // dump, and each block's part of it is visibly its own.
    const sections = inBlocks(triples, blocks).map((block) => {
        const banner = `#\n# ${block.title}\n#`;
        const subjects = [...bySubject(block.triples).entries()].map(([subject, subjectTriples]) => {
            const lines = subjectTriples.map((triple) => `    ${triple.predicate} ${turtleObject(triple.object)}`);
            return `${subject}\n${lines.join(' ;\n')} .`;
        });
        return `${banner}\n\n${subjects.join('\n\n')}`;
    });

    return `${header}\n\n${sections.join('\n\n')}\n`;
}

/**
 * JSON-LD.
 *
 * The same blocks, in the same order, which means **a subject may appear in `@graph` more than
 * once** — once in each block that says something about it. That is ordinary JSON-LD: a graph is a
 * set of statements, and two nodes with one `@id` merge on expansion. Worth knowing before it
 * surprises a reader who expects one object per subject.
 *
 * @param {Triple[]} triples
 * @param {DocumentShape} shape
 * @returns {object}
 */
export function toJsonLd(triples, { prefixes, blocks }) {
    const graph = inBlocks(triples, blocks).flatMap((block) => (
        [...bySubject(block.triples).entries()].map(([subject, subjectTriples]) => {
            const node = { '@id': subject };
            subjectTriples.forEach((triple) => {
                if (triple.predicate === 'rdf:type') {
                    node['@type'] = node['@type'] ?? [];
                    node['@type'].push(triple.object.id);
                    return;
                }
                node[triple.predicate] = node[triple.predicate] ?? [];
                node[triple.predicate].push(jsonLdObject(triple.object));
            });
            return node;
        })
    ));
    return { '@context': { ...prefixes }, '@graph': graph };
}
