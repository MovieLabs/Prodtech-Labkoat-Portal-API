/**
 * Turn the SKOS graph into terms and collections.
 *
 * ## The one transform that matters
 *
 * The 12 schemes look like 12 taxonomies. They are not. There is **one global `broader`/`narrower`
 * tree**, and a scheme is a filter over it — which is why rearranging a term for one audience
 * rearranges it for every audience, and why the vocabulary cannot be reused in parts.
 *
 * This module resolves that. For each scheme `S` independently, a concept `C` that is `inScheme S`
 * gets a member in `S`, and its parent is the concept `B` where **`B narrower C` *and* `B inScheme
 * S`**. That second clause is the whole trick: the same concept can have different parents in
 * different schemes, or a parent in one and none in another, and after this each collection holds
 * its own arrangement that can be edited without touching the others.
 *
 * A concept with no such parent, or one marked `topConceptOf S`, sits at the top of that collection.
 *
 * ## What the migration deliberately does not do
 *
 * - **It does not remint ids.** `vmc:c-0000b8` is what external consumers key on; a migration that
 *   renamed everything would be a breaking change disguised as an internal move.
 * - **It does not classify alternate labels.** Every one becomes `alternate`, because the source
 *   genuinely does not record whether it is a synonym or an abbreviation. Guessing would put
 *   fabricated data in the store and there would be no way to tell it from the real thing later.
 * - **It does not drop anything it does not understand.** An unrecognised property is carried into
 *   `legacy` rather than discarded, so nothing is lost silently.
 *
 * @module vocabulary/migrate/buildModel
 */

import { indexEdges, relatedTo } from './readGraph.js';

const DEFAULT_LANGUAGE = 'en';

/** Node types in the source graph. The SKOS root is typed `omc:Root` — see the note in `build`. */
const CONCEPT = 'skos:Concept';
const SCHEME = 'skos:ConceptScheme';
const LABEL = 'skosxl:Label';

/**
 * The properties a Concept carries that become something specific on the term. Anything else the
 * node holds is preserved under `legacy`.
 */
const KNOWN_CONCEPT_PROPS = new Set([
    'id', 'type', 'prefLabel', 'definition', 'status', 'example', 'editorialNote', 'language',
]);

/**
 * Build a term from a Concept node and its label edges.
 *
 * The Label nodes collapse into the term's own `label` array. That removes an entire class of bug:
 * the scheme whose missing Label silently voids every membership in it, the shared-Label deletion
 * check, and the alt-label editor that mints an id and so writes an edge to a node that is never
 * created.
 *
 * @param {object} node - The Concept's properties
 * @param {object} ctx - `{ graph, out }`
 * @returns {object} A `vocab_terms` document
 */
function buildTerm(node, { graph, out }) {
    const labelNode = ((id) => {
        const label = graph.nodes.get(id);
        if (!label || label.type !== LABEL) return null;
        return label;
    });

    // The preferred label exists twice in the source: a string property on the Concept, and a
    // related Label node. They are supposed to agree. Where they do not, the Label node wins —
    // it is the one the SKOS output is built from — but the disagreement is recorded rather than
    // quietly resolved, because it means something upstream wrote only one of the two.
    const prefFromEdge = relatedTo(out, node.id, 'prefLabel').map(labelNode).filter(Boolean)[0];
    const prefValue = prefFromEdge?.value ?? node.prefLabel ?? null;
    const prefLanguage = prefFromEdge?.language ?? node.language ?? DEFAULT_LANGUAGE;

    const label = [];
    if (prefValue) {
        label.push({ value: prefValue, language: prefLanguage, labelType: 'pref' });
    }

    // Every alternate label migrates as `alternate`, not as a guess at synonym/abbreviation.
    relatedTo(out, node.id, 'altLabel')
        .map(labelNode)
        .filter(Boolean)
        .forEach((alt) => {
            label.push({
                value: alt.value,
                language: alt.language ?? DEFAULT_LANGUAGE,
                labelType: 'alternate',
            });
        });

    const note = [];
    if (node.editorialNote) {
        note.push({
            value: node.editorialNote,
            language: prefLanguage,
            noteType: 'editorial',
        });
    }

    const example = [];
    if (node.example) {
        example.push({
            value: node.example,
            language: prefLanguage,
            exampleType: 'example',
        });
    }

    // Anything the node carried that this migration has no home for. Empty in the current data;
    // present so that a property added to Neo4j after this was written is not thrown away.
    const legacy = Object.fromEntries(
        Object.entries(node).filter(([key]) => !KNOWN_CONCEPT_PROPS.has(key)),
    );

    const term = {
        _id: node.id,
        label,
        definition: node.definition ? { [prefLanguage]: node.definition } : {},
        note,
        example,
        status: node.status ?? 'proposed',
        migrated: true,
    };

    if (Object.keys(legacy).length) term.legacy = legacy;
    if (prefFromEdge && node.prefLabel && prefFromEdge.value !== node.prefLabel) {
        term.labelDisagreement = { node: node.prefLabel, label: prefFromEdge.value };
    }
    return term;
}

/**
 * Build one collection from one scheme, resolving that scheme's own arrangement.
 *
 * @param {string} schemeId
 * @param {object} node - The ConceptScheme's properties
 * @param {object} ctx - `{ graph, out, in: inbound, membership }`
 * @returns {object} A `vocab_collections` document
 */
function buildCollection(schemeId, node, ctx) {
    const { out, membership } = ctx;

    /** Concepts in this scheme. A Set so the parent test below is O(1) per candidate. */
    const inThisScheme = membership.get(schemeId) ?? new Set();

    /** Concepts the scheme names as top concepts. */
    const declaredTop = new Set(relatedTo(out, schemeId, 'hasTopConcept'));

    /**
     * The parent of `conceptId` **within this scheme**.
     *
     * Read from `broader` on the concept, narrowed to a candidate that is itself in this scheme.
     * A concept broader than this one but belonging to a different scheme is not a parent here —
     * that is precisely what stops one shared tree imposing itself on twelve collections.
     *
     * More than one candidate is possible: the source permits a concept to be narrower than two
     * concepts in the same scheme, which a tree cannot represent. The first is taken and the rest
     * are reported, because silently picking one would hide a real modelling question.
     */
    const parentsInScheme = ((conceptId) => relatedTo(out, conceptId, 'broader')
        .filter((candidate) => inThisScheme.has(candidate)));

    const member = [];
    const multipleParents = [];

    // A member id per concept, assigned up front so `parent` can name one before it is emitted.
    const midFor = new Map();
    [...inThisScheme].forEach((conceptId, index) => {
        midFor.set(conceptId, `m${index + 1}`);
    });

    [...inThisScheme].forEach((conceptId) => {
        const parents = parentsInScheme(conceptId);
        if (parents.length > 1) multipleParents.push({ concept: conceptId, parents });

        // Declared top concepts sit at the top even if a broader concept in this scheme exists —
        // the declaration is explicit and the `broader` edge may be a leftover.
        const parent = declaredTop.has(conceptId) ? null : (parents[0] ?? null);

        member.push({
            mid: midFor.get(conceptId),
            term: conceptId,
            parent: parent ? midFor.get(parent) : null,
        });
    });

    const collection = {
        _id: schemeId,
        label: [{
            value: node.prefLabel ?? schemeId,
            language: DEFAULT_LANGUAGE,
            labelType: 'pref',
        }],
        definition: node.definition ? { [DEFAULT_LANGUAGE]: node.definition } : {},
        // The 12 migrated schemes are all schemes in SKOS terms, so today's output keeps its shape.
        skosAs: 'conceptScheme',
        member,
        migrated: true,
    };

    if (multipleParents.length) collection.multipleParents = multipleParents;
    return collection;
}

/**
 * Build the whole model from the graph.
 *
 * @param {import('./readGraph.js').SkosGraph} graph
 * @returns {{terms: Array<object>, collections: Array<object>, report: object}}
 */
export function buildModel(graph) {
    const { out } = indexEdges(graph);
    const ctx = { graph, out };

    const nodesOfType = ((type) => [...graph.nodes.entries()].filter(([, node]) => node.type === type));

    // Scheme membership, indexed once. Read from the concept's own `inScheme` edges rather than
    // from the scheme, because `inScheme` is the edge the source actually maintains.
    const membership = new Map();
    nodesOfType(SCHEME).forEach(([schemeId]) => membership.set(schemeId, new Set()));
    nodesOfType(CONCEPT).forEach(([conceptId]) => {
        relatedTo(out, conceptId, 'inScheme').forEach((schemeId) => {
            if (!membership.has(schemeId)) membership.set(schemeId, new Set());
            membership.get(schemeId).add(conceptId);
        });
    });

    const terms = nodesOfType(CONCEPT).map(([, node]) => buildTerm(node, ctx));

    const collections = nodesOfType(SCHEME)
        .map(([schemeId, node]) => buildCollection(schemeId, node, { ...ctx, membership }));

    // A concept in no scheme at all. The old table showed these in a permanent "no scheme" bucket
    // and they are real data, so they migrate as terms — they simply appear in no collection until
    // someone places them. Counted so the number is visible rather than discovered.
    const placed = new Set(collections.flatMap((c) => c.member.map((m) => m.term)));
    const unplaced = terms.filter((term) => !placed.has(term._id)).map((term) => term._id);

    // How many terms sit in more than one collection. This is the reuse the model exists for, and
    // the number is a direct check against the source: 20 in the current data.
    const placements = new Map();
    collections.forEach((collection) => {
        collection.member.forEach((m) => {
            placements.set(m.term, (placements.get(m.term) ?? 0) + 1);
        });
    });
    const multiPlaced = [...placements.entries()].filter(([, count]) => count > 1);

    return {
        terms,
        collections,
        report: {
            terms: terms.length,
            collections: collections.length,
            members: collections.reduce((total, c) => total + c.member.length, 0),
            termsInMultipleCollections: multiPlaced.length,
            unplacedTerms: unplaced.length,
            unplacedSample: unplaced.slice(0, 10),
            labelDisagreements: terms.filter((t) => t.labelDisagreement).length,
            collectionsWithMultipleParents: collections.filter((c) => c.multipleParents).length,
        },
    };
}

/**
 * The collection that gathers every migrated scheme, so "the whole vocabulary" is addressable.
 *
 * This is what the root and its `hasScheme` edges become. It is an ordinary collection whose
 * members are other collections — which is the composition the model is built on, not a special
 * case for the root.
 *
 * @param {Array<object>} collections - The migrated scheme collections
 * @returns {object} A `vocab_collections` document
 */
export function buildRootCollection(collections) {
    return {
        _id: 'coll:media-creation',
        label: [{ value: 'Media Creation', language: DEFAULT_LANGUAGE, labelType: 'pref' }],
        definition: {
            en: 'Every scheme migrated from the original vocabulary, gathered so the whole '
                + 'vocabulary can be published as one.',
        },
        // A grouping of schemes, not a scheme itself — schemes cannot nest in SKOS.
        skosAs: 'transparent',
        member: collections.map((collection, index) => ({
            mid: `m${index + 1}`,
            collection: collection._id,
            parent: null,
        })),
        migrated: true,
    };
}
