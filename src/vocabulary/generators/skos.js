/**
 * Project a resolved view into SKOS, as Turtle or JSON-LD.
 *
 * One projection, two encodings. The old code had two hand-written serializers that had drifted
 * apart — JSON-LD emitted `skos:altLabel` as a literal and Turtle emitted it as a URI, which is
 * wrong; both duplicated the status filter as a literal; and JSON-LD put an always-empty
 * `vmc:hasAcronym` on every concept. Building the triples once and encoding them twice makes that
 * class of divergence impossible rather than merely fixed.
 *
 * ## Loss is declared, not accidental
 *
 * The vocabulary records more than SKOS can say. Each label, note and example **type** declares the
 * predicate it projects to, in its facet — so an abbreviation and a synonym both arrive as
 * `skos:altLabel` while staying distinct in the store, and a type whose facet says `skos: null` is
 * omitted **because somebody decided it should be**. A type with no facet entry at all is a
 * different thing: it is unknown, and it is reported rather than dropped in silence.
 *
 * @module vocabulary/generators/skos
 */

import {
    broaderOf, placementsByTerm, schemeHeads, schemesOf, topConceptOf,
} from '../resolve.js';
import { localised, otherLabels, prefLabel } from '../store/read.js';

const PREFIXES = {
    skos: 'http://www.w3.org/2004/02/skos/core#',
    skosxl: 'http://www.w3.org/2008/05/skos-xl#',
    owl: 'http://www.w3.org/2002/07/owl#',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    vmc: 'https://mc.movielabs.com/vmc#',
};

/** Where a view that names no ontology of its own is published. */
const ONTOLOGY = 'https://mc.movielabs.com/vmc';

/**
 * @typedef {object} Triple
 * @property {string} subject - A prefixed id
 * @property {string} predicate - A prefixed predicate
 * @property {object|string} object - `{ id }` for a reference, or `{ value, language }` for a literal
 */

/**
 * Look up the predicate a facet value projects to.
 *
 * Three outcomes, and they are deliberately different: a known type with a predicate projects; a
 * known type with `skos: null` is dropped by declaration; an unknown type is dropped *and reported*,
 * because it means a facet value was removed while terms still use it.
 *
 * @param {Map<string, Map<string, string|null>>} index - From `skosProjectionIndex`
 * @param {string} target - `label` | `note` | `example`
 * @param {string} type - The value, e.g. `abbreviation`
 * @returns {{predicate: string|null, known: boolean}}
 */
function projection(index, target, type) {
    const values = index.get(target);
    if (!values || !values.has(type)) return { predicate: null, known: false };
    return { predicate: values.get(type), known: true };
}

/**
 * Build the triples for a resolved view.
 *
 * @param {object} resolution - From `resolveView`
 * @param {Map<string, Map<string, string|null>>} projections - From `skosProjectionIndex`
 * @returns {{triples: Triple[], problems: object}}
 */
export function skosTriples(resolution, projections) {
    const { terms, language } = resolution;
    const triples = [];
    const problems = { unknownTypes: [] };
    // The terms this view publishes as schemes, and the identifier each takes. Read twice: once to
    // emit the schemes, once so a head can say it belongs to its own.
    const heads = schemeHeads(resolution);

    const add = ((subject, predicate, object) => triples.push({ subject, predicate, object }));
    const literal = ((value, lang = language) => ({ value, language: lang }));
    const ref = ((id) => ({ id }));

    // ---- the ontology itself ----
    //
    // The artifact's own identity, and the only place a union of vocabularies can be named. SKOS
    // has no aggregate of schemes and needs none — publishing two vocabularies together is
    // publishing the union of their triples, with every scheme keeping one identifier and one type.
    // What the union needs is a name and a statement of what it gathers, which is what OWL says
    // here without touching skos:Concept at all.
    const ontology = resolution.view?.ontology ?? ONTOLOGY;
    add(`<${ontology}>`, 'rdf:type', ref('owl:Ontology'));
    const ontologyLabel = prefLabel(resolution.view, language);
    if (ontologyLabel) add(`<${ontology}>`, 'rdfs:label', literal(ontologyLabel));
    (resolution.imports ?? []).forEach((imported) => {
        add(`<${ontology}>`, 'owl:imports', ref(`<${imported}>`));
    });

    // ---- schemes ----
    //
    // A term the view attaches directly, carrying an arrangement, **is** the vocabulary: it comes
    // out as a `skos:ConceptScheme` and not as a concept, and its children are that scheme's top
    // concepts. Nothing on the term declares this — it is where the term sits, so the same term
    // heads a vocabulary in the view that attaches it and is an ordinary concept in a view that
    // reaches it three levels down.
    //
    // A term the view attaches that carries no arrangement is just a concept, and the tree below it
    // works the usual way.
    heads.forEach((schemeId, termId) => {
        const term = terms.get(termId);
        if (!term) return;
        add(schemeId, 'rdf:type', ref('skos:ConceptScheme'));
        add(schemeId, 'skos:prefLabel', literal(prefLabel(term, language)));
        const definition = localised(term.definition, language);
        if (definition) add(schemeId, 'skos:definition', literal(definition));
    });

    // ---- concepts ----

    const byTerm = placementsByTerm(resolution);

    byTerm.forEach((all, termId) => {
        const term = terms.get(termId);
        if (!term) return;

        // **A scheme head's own placement is the scheme, not a concept appearance.** It is the one
        // placement the view attaches directly, so it is the one with an empty path; every other
        // placement of the same term is a genuine appearance somewhere else and still counts.
        //
        // A term that is *only* a scheme head therefore emits no concept at all — which is the
        // point. Emitting one made `Audio` a scheme whose single top concept was `Audio`, and every
        // real top concept then carried a `broader` back to it.
        const placements = heads.has(termId) ? all.filter((one) => one.path.length) : all;
        if (!placements.length) return;

        add(termId, 'rdf:type', ref('skos:Concept'));

        // Labels. The preferred one is the entry whose type is `pref`; everything else projects
        // through its facet.
        add(termId, 'skos:prefLabel', literal(prefLabel(term, language)));
        otherLabels(term).forEach((entry) => {
            const { predicate, known } = projection(projections, 'label', entry.labelType);
            if (!known) {
                problems.unknownTypes.push({ term: termId, target: 'label', type: entry.labelType });
                return;
            }
            if (predicate) add(termId, predicate, literal(entry.value, entry.language));
        });

        const definition = localised(term.definition, language);
        if (definition) add(termId, 'skos:definition', literal(definition));

        (term.note ?? []).forEach((entry) => {
            const { predicate, known } = projection(projections, 'note', entry.noteType);
            if (!known) {
                problems.unknownTypes.push({ term: termId, target: 'note', type: entry.noteType });
                return;
            }
            if (predicate) add(termId, predicate, literal(entry.value, entry.language));
        });

        (term.example ?? []).forEach((entry) => {
            const { predicate, known } = projection(projections, 'example', entry.exampleType);
            if (!known) {
                problems.unknownTypes.push({ term: termId, target: 'example', type: entry.exampleType });
                return;
            }
            if (predicate) add(termId, predicate, literal(entry.value, entry.language));
        });

        // Structure. Deduplicated across placements: a term appearing three times in one scheme
        // says `inScheme` once, and a `broader` reached by two routes is asserted once.
        const inScheme = new Set();
        const tops = new Set();
        const broader = new Set();

        placements.forEach((placement) => {
            schemesOf(placement).forEach((scheme) => inScheme.add(scheme));
            topConceptOf(placement).forEach((scheme) => tops.add(scheme));
            const above = broaderOf(placement);
            if (above) broader.add(above);
        });

        inScheme.forEach((scheme) => add(termId, 'skos:inScheme', ref(scheme)));
        tops.forEach((scheme) => {
            add(termId, 'skos:topConceptOf', ref(scheme));
            add(scheme, 'skos:hasTopConcept', ref(termId)); // Both halves, as SKOS expects
        });
        broader.forEach((above) => {
            add(termId, 'skos:broader', ref(above));
            add(above, 'skos:narrower', ref(termId));
        });
    });

    return { triples, problems };
}

/** Escape a literal for Turtle. The old serializer did none of this. */
const escapeTurtle = ((value) => String(value)
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t'));

/**
 * Turtle.
 *
 * @param {Triple[]} triples
 * @returns {string}
 */
export function toTurtle(triples) {
    const header = Object.entries(PREFIXES)
        .map(([prefix, uri]) => `@prefix ${prefix}: <${uri}> .`)
        .join('\n');

    // Grouped by subject so the output reads as a document rather than a triple dump.
    const bySubject = new Map();
    triples.forEach((triple) => {
        if (!bySubject.has(triple.subject)) bySubject.set(triple.subject, []);
        bySubject.get(triple.subject).push(triple);
    });

    const blocks = [...bySubject.entries()].map(([subject, subjectTriples]) => {
        const lines = subjectTriples.map((triple) => {
            const object = triple.object.id
                ? triple.object.id
                : `"${escapeTurtle(triple.object.value)}"${triple.object.language ? `@${triple.object.language}` : ''}`;
            return `    ${triple.predicate} ${object}`;
        });
        return `${subject}\n${lines.join(' ;\n')} .`;
    });

    return `${header}\n\n${blocks.join('\n\n')}\n`;
}

/**
 * JSON-LD.
 *
 * @param {Triple[]} triples
 * @returns {object}
 */
export function toJsonLd(triples) {
    const bySubject = new Map();
    triples.forEach((triple) => {
        if (!bySubject.has(triple.subject)) bySubject.set(triple.subject, {});
        const node = bySubject.get(triple.subject);

        if (triple.predicate === 'rdf:type') {
            node['@type'] = node['@type'] ?? [];
            node['@type'].push(triple.object.id);
            return;
        }
        node[triple.predicate] = node[triple.predicate] ?? [];
        node[triple.predicate].push(
            triple.object.id
                ? { '@id': triple.object.id }
                : { '@value': triple.object.value, '@language': triple.object.language },
        );
    });

    const graph = [...bySubject.entries()].map(([subject, node]) => ({ '@id': subject, ...node }));
    return { '@context': { ...PREFIXES }, '@graph': graph };
}
