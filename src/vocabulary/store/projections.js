/**
 * How a collection projects into each export target.
 *
 * ## Keyed by target, not a type
 *
 * Every one of these documents is a collection; the value says what a **SKOS consumer** should see,
 * and that is one target among several. The CSV and JSON generators express the arrangement
 * directly and need no such instruction; a future target may need a different one. So:
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
 *
 * @param {object} collection
 * @param {string} [target='skos']
 * @returns {string}
 */
export function projectionOf(collection, target = 'skos') {
    return collection?.projections?.[target] ?? DEFAULT_PROJECTION;
}

