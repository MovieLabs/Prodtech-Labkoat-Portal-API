/**
 * Project a resolved view into SKOS, as Turtle or JSON-LD.
 *
 * One projection, two encodings. The old code had two hand-written serializers that had drifted
 * apart — JSON-LD emitted `skos:altLabel` as a literal and Turtle emitted it as a URI, which is
 * wrong; both duplicated the status filter as a literal; and JSON-LD put an always-empty
 * `mlv:hasAcronym` on every concept. Building the triples once and encoding them twice makes that
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
 * ## A dictionary, and one arrangement of it
 *
 * The document is written in three blocks, and the split is the point of the shape rather than a
 * formatting preference. The **terms** carry identity and properties and no structure — that is the
 * dictionary, and a term means the same thing in every view that reaches it. The **arrangement**
 * says what this view does with them: which terms head schemes, what is broader than what, and that
 * all of it arrived together as one `skos:Collection`.
 *
 * Nothing structural follows from the split — a consumer parsing the triples gets the same graph
 * either way. What follows is that somebody reading the file can see which half is the vocabulary
 * and which half is one opinion about it.
 *
 * @module vocabulary/generators/skos
 */

import {
    broaderOf, placementsByTerm, schemeHeads, schemesOf, topConceptOf,
} from '../resolve.js';
import {
    NAMESPACE, ONTOLOGY_BASE, ontologyFor, viewCollectionIdFor,
} from '../store/ids.js';
import { localised, otherLabels, prefLabel } from '../store/read.js';

import { toJsonLd as serialiseJsonLd, toTurtle as serialiseTurtle } from './rdfSerialise.js';

/**
 * The vocabulary's own prefix is the one its stored ids carry, because an id is written out as a
 * CURIE exactly as stored. Declared from the same constant, so the two cannot disagree.
 */
const PREFIXES = {
    skos: 'http://www.w3.org/2004/02/skos/core#',
    skosxl: 'http://www.w3.org/2008/05/skos-xl#',
    owl: 'http://www.w3.org/2002/07/owl#',
    rdf: 'http://www.w3.org/1999/02/22-rdf-syntax-ns#',
    rdfs: 'http://www.w3.org/2000/01/rdf-schema#',
    dct: 'http://purl.org/dc/terms/',
    [NAMESPACE]: `${ONTOLOGY_BASE}#`,
};

/** The blocks a document is written in, in the order they appear. */
const BLOCKS = [
    { name: 'header', title: 'This document' },
    { name: 'terms', title: 'Terms — identity and properties, no structure' },
    { name: 'structure', title: 'Arrangement — what this view makes of them' },
];

/**
 * What every scheme and collection here says about itself.
 *
 * A published view is one arrangement, not the whole of anything. Two of them can be loaded together
 * — they are triples, and a term keeps one identifier throughout — but each was arranged for its own
 * purpose, so the union of two structures is not itself a considered structure. Saying so in the
 * document means a consumer merging them has been told, rather than finding out from the result.
 */
const STANDALONE = 'This is a standalone scheme. Its structure is one view of the term dictionary; '
    + 'the terms carry their own identity and properties independently of it. It may be merged with '
    + 'other schemes, but a merge combines structures that were arranged for different purposes, and '
    + 'the result may not be coherent.';

/**
 * @typedef {object} Triple
 * @property {string} subject - A prefixed id
 * @property {string} predicate - A prefixed predicate
 * @property {object|string} object - `{ id }` for a reference, or `{ value, language }` for a literal
 * @property {string} block - The block of the document it is written in, one of `BLOCKS`
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

    const add = ((subject, predicate, object, block) => triples
        .push({ subject, predicate, object, block }));
    const literal = ((value, lang = language) => ({ value, language: lang }));
    const ref = ((id) => ({ id }));

    // ---- the ontology itself ----
    //
    // The artifact's own identity, and the only place a union of vocabularies can be named. SKOS
    // has no aggregate of schemes and needs none — publishing two vocabularies together is
    // publishing the union of their triples, with every scheme keeping one identifier and one type.
    // What the union needs is a name and a statement of what it gathers, which is what OWL says
    // here without touching skos:Concept at all.
    const ontology = ontologyFor(resolution.view);
    add(`<${ontology}>`, 'rdf:type', ref('owl:Ontology'), 'header');
    const viewLabel = prefLabel(resolution.view, language);
    if (viewLabel) add(`<${ontology}>`, 'rdfs:label', literal(viewLabel), 'header');
    (resolution.imports ?? []).forEach((imported) => {
        add(`<${ontology}>`, 'owl:imports', ref(`<${imported}>`), 'header');
    });

    // ---- the view, as a collection ----
    //
    // What SKOS has for "these things were published together": a `skos:Collection`, identified by
    // the view rather than by anything in it, so two views that share terms stay two collections.
    // Its members are the concepts below; the schemes are not members, because `skos:member` ranges
    // over Concept and Collection and a ConceptScheme in there is a validator finding. They are
    // reached instead through the `skos:inScheme` their own members carry.
    const collection = viewCollectionIdFor(resolution.view?._id);
    add(collection, 'rdf:type', ref('skos:Collection'), 'header');
    if (viewLabel) add(collection, 'skos:prefLabel', literal(viewLabel), 'header');
    const viewDefinition = localised(resolution.view?.definition, language);
    add(
        collection,
        'dct:description',
        literal(viewDefinition ? `${viewDefinition}\n\n${STANDALONE}` : STANDALONE),
        'header',
    );

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
    // The identifier is the view's as much as the term's — `mlv:s-media-creation.000041` — because a
    // scheme *is* an arrangement, and the arrangement belongs to the view. Keyed on the term alone,
    // two views that both head `Audio` would publish one identifier for two different structures,
    // and a consumer holding both documents would read their union as a single scheme.
    heads.forEach((schemeId, termId) => {
        const term = terms.get(termId);
        if (!term) return;
        add(schemeId, 'rdf:type', ref('skos:ConceptScheme'), 'structure');
        add(schemeId, 'skos:prefLabel', literal(prefLabel(term, language)), 'structure');
        const definition = localised(term.definition, language);
        if (definition) add(schemeId, 'skos:definition', literal(definition), 'structure');
        add(schemeId, 'dct:description', literal(STANDALONE), 'structure');
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

        add(termId, 'rdf:type', ref('skos:Concept'), 'terms');
        // Everything the view publishes as a concept is a member of the view's collection. Said
        // here rather than in a second walk, because this is where a term is decided to be one.
        add(collection, 'skos:member', ref(termId), 'structure');

        // Labels. The preferred one is the entry whose type is `pref`; everything else projects
        // through its facet.
        add(termId, 'skos:prefLabel', literal(prefLabel(term, language)), 'terms');
        otherLabels(term).forEach((entry) => {
            const { predicate, known } = projection(projections, 'label', entry.labelType);
            if (!known) {
                problems.unknownTypes.push({ term: termId, target: 'label', type: entry.labelType });
                return;
            }
            if (predicate) add(termId, predicate, literal(entry.value, entry.language), 'terms');
        });

        const definition = localised(term.definition, language);
        if (definition) add(termId, 'skos:definition', literal(definition), 'terms');

        (term.note ?? []).forEach((entry) => {
            const { predicate, known } = projection(projections, 'note', entry.noteType);
            if (!known) {
                problems.unknownTypes.push({ term: termId, target: 'note', type: entry.noteType });
                return;
            }
            if (predicate) add(termId, predicate, literal(entry.value, entry.language), 'terms');
        });

        (term.example ?? []).forEach((entry) => {
            const { predicate, known } = projection(projections, 'example', entry.exampleType);
            if (!known) {
                problems.unknownTypes.push({ term: termId, target: 'example', type: entry.exampleType });
                return;
            }
            if (predicate) add(termId, predicate, literal(entry.value, entry.language), 'terms');
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

        inScheme.forEach((scheme) => add(termId, 'skos:inScheme', ref(scheme), 'structure'));
        tops.forEach((scheme) => {
            add(termId, 'skos:topConceptOf', ref(scheme), 'structure');
            // Both halves, as SKOS expects
            add(scheme, 'skos:hasTopConcept', ref(termId), 'structure');
        });
        broader.forEach((above) => {
            add(termId, 'skos:broader', ref(above), 'structure');
            add(above, 'skos:narrower', ref(termId), 'structure');
        });
    });

    return { triples, problems };
}

/**
 * Turtle, grouped into the dictionary and the arrangement of it so the two are visibly two halves.
 *
 * @param {Triple[]} triples
 * @returns {string}
 */
export const toTurtle = ((triples) => serialiseTurtle(triples, { prefixes: PREFIXES, blocks: BLOCKS }));

/**
 * JSON-LD. A subject may appear in `@graph` twice — once describing a term and once placing it.
 *
 * @param {Triple[]} triples
 * @returns {object}
 */
export const toJsonLd = ((triples) => serialiseJsonLd(triples, { prefixes: PREFIXES, blocks: BLOCKS }));
