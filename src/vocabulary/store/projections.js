/**
 * How a collection projects into each export target.
 *
 * ## Why this is not called `skosAs` any more
 *
 * The field used to be `skosAs`, and it read as a *type*: a collection was a scheme, or a
 * collection, or a grouping. It is not. Every one of these documents is a collection; the value says
 * what a **SKOS consumer** should see, and that is one target among several. The CSV and JSON
 * generators express the arrangement directly and need no such instruction; a future target may need
 * a different one.
 *
 * So it is `projections`, keyed by target:
 *
 * ```json
 * { "projections": { "skos": "conceptScheme" } }
 * ```
 *
 * A target with nothing declared falls back to `collection`, which is the modest reading — a named
 * group with no claim of ownership over its terms. A scheme is a claim about what a body of terms
 * *is*, so it has to be asked for.
 *
 * ## The three SKOS values, and the rule that binds them
 *
 * | value | what a SKOS consumer receives |
 * |---|---|
 * | `conceptScheme` | `skos:ConceptScheme`; its terms carry `inScheme`, the top ones `topConceptOf` |
 * | `collection` | `skos:Collection`; terms are `skos:member`, and nothing on the term says so |
 * | `transparent` | nothing at all; its members come out as though they sat where it does |
 *
 * **SKOS declares all three classes mutually disjoint** (SKOS Reference S9 and S12). That is why
 * this value lives on the collection and not on the inclusion: one identifier must not be a
 * ConceptScheme in one published artifact and a Concept or Collection in another, and per-inclusion
 * overrides are exactly the mechanism that would produce it. The one variation that would be safe —
 * `transparent` on one side, since it emits no node to contradict — is not worth a second way to
 * say the same thing.
 *
 * @module vocabulary/store/projections
 */

/** The values `projections.skos` admits. */
export const SKOS_PROJECTIONS = ['conceptScheme', 'collection', 'transparent'];

/** What a collection projects as when it says nothing. */
export const DEFAULT_PROJECTION = 'collection';

/**
 * How a collection projects into one target.
 *
 * Reads the legacy `skosAs` when `projections` is absent, so a store written before the rename keeps
 * working and a migration is a tidy-up rather than a prerequisite.
 *
 * @param {object} collection
 * @param {string} [target='skos']
 * @returns {string}
 */
export function projectionOf(collection, target = 'skos') {
    const declared = collection?.projections?.[target];
    if (declared) return declared;
    if (target === 'skos' && collection?.skosAs) return collection.skosAs;
    return DEFAULT_PROJECTION;
}

/**
 * Whether this collection is a SKOS concept scheme.
 *
 * Its own function because it is asked in four places and a stray `=== 'conceptScheme'` against the
 * wrong field is silent: the collection simply stops being a scheme and its terms lose `inScheme`.
 *
 * @param {object} collection
 * @returns {boolean}
 */
export const isScheme = ((collection) => projectionOf(collection, 'skos') === 'conceptScheme');
