/**
 * The controlled sets a term's labels, notes and examples are classified by.
 *
 * ## The `skos` field is what lets this model exceed SKOS without lying in the output
 *
 * The vocabulary records more than SKOS can express — that a name is an abbreviation rather than a
 * synonym, that a note is creative intent rather than editorial. SKOS has one predicate where we
 * have several, so each value declares **its own projection**: a synonym and an abbreviation both
 * become `skos:altLabel` on export, and stay distinguishable everywhere else.
 *
 * A value with `skos: null` is dropped from SKOS output **by declaration** rather than by accident.
 * That distinction is the whole point: today's serializers silently omit whatever they were not
 * written to handle, and nothing records that a decision was made.
 *
 * ## These are seeds, not a schema
 *
 * They are written once if absent and never overwritten, because the lists are meant to be edited
 * in the tool. Adding "trade name" as a kind of label is an editor's job, not a deploy.
 *
 * @module vocabulary/store/facetSeeds
 */

/**
 * @typedef {object} FacetValue
 * @property {object} label - Multilingual display name, keyed by language
 * @property {string|null} [skos] - The SKOS predicate this projects to, or null to drop it
 */

/**
 * The seed facets.
 *
 * `key` names the field each value carries, and it is deliberately the **same name as the field on
 * the term** it fills — a `labelType` value is keyed `labelType`. Nothing has to be translated
 * between the facet and the thing it classifies.
 *
 * @type {Array<object>}
 */
export const FACET_SEEDS = [
    {
        _id: 'facet:labelType',
        appliesTo: 'label',
        key: 'labelType',
        label: { en: 'Label' },
        definition: { en: 'The set of allowed labels.' },
        values: [
            // Exactly one `pref` per language per term — enforced on write, not here. This is the
            // one cost of collapsing prefLabel into the label array, and it is worth paying: a
            // preferred name is a kind of name, not a different field.
            { labelType: 'pref', label: { en: 'Preferred' }, skos: 'skos:prefLabel' },
            { labelType: 'alternate', label: { en: 'Alternate' }, skos: 'skos:altLabel' },
            { labelType: 'synonym', label: { en: 'Synonym' }, skos: 'skos:altLabel' },
            { labelType: 'abbreviation', label: { en: 'Abbreviation' }, skos: 'skos:altLabel' },
            { labelType: 'acronym', label: { en: 'Acronym' }, skos: 'skos:altLabel' },
            // The token OMC-JSON uses for this term — `audio` where the preferred name is `Audio`.
            // A view that publishes controlled values renders from this kind instead of the
            // preferred one.
            //
            // **`skos: null`, so it is omitted from SKOS by declaration.** It was `altLabel`, which
            // is defensible — it is a genuine alternative name — but it put a lowercase echo of the
            // preferred label on nearly every concept, which reads as noise rather than as a name
            // anyone would search for. Declaring the omission is the supported way to say that: the
            // generator drops it silently, where a type missing from the facet altogether is dropped
            // *and reported*, and blocks editing every term still carrying one.
            { labelType: 'omcToken', label: { en: 'OMC Token' }, skos: null },
            // A known-wrong spelling, recorded so a search can find it. `hiddenLabel` is exactly
            // what SKOS provides for this and the old model had no way to say it.
            { labelType: 'misspelling', label: { en: 'Misspelling' }, skos: 'skos:hiddenLabel' },
        ],
    },
    {
        _id: 'facet:noteType',
        appliesTo: 'note',
        key: 'noteType',
        label: { en: 'Note' },
        definition: { en: 'The set of allowed notes.' },
        values: [
            { noteType: 'editorial', label: { en: 'Editorial' }, skos: 'skos:editorialNote' },
            // No SKOS predicate means this; `skos:note` is the general case and the honest choice.
            { noteType: 'creativeIntent', label: { en: 'Creative Intent' }, skos: 'skos:note' },
            { noteType: 'scope', label: { en: 'Scope' }, skos: 'skos:scopeNote' },
            { noteType: 'history', label: { en: 'History' }, skos: 'skos:historyNote' },
            { noteType: 'change', label: { en: 'Change' }, skos: 'skos:changeNote' },
        ],
    },
    {
        _id: 'facet:exampleType',
        appliesTo: 'example',
        key: 'exampleType',
        label: { en: 'Example' },
        definition: { en: 'The set of allowed examples.' },
        values: [
            { exampleType: 'example', label: { en: 'Example' }, skos: 'skos:example' },
            { exampleType: 'url', label: { en: 'URL' }, skos: 'skos:example' },
        ],
    },
    {
        _id: 'facet:departmentOrRole',
        appliesTo: 'tag',
        key: 'tag',
        label: { en: 'Department or Role' },
        definition: {
            en: 'The set of allowed tags. A view uses these to say whether a term designates a '
                + 'department or a role, which nothing on the term itself says.',
        },
        // Tag facets carry no `skos`: a tag is a view's own designation, and it projects only where
        // a generator asks for it.
        values: [
            { tag: 'department', label: { en: 'Department' } },
            { tag: 'role', label: { en: 'Role' } },
        ],
    },
    {
        _id: 'facet:status',
        appliesTo: 'status',
        key: 'status',
        label: { en: 'Status' },
        definition: {
            en: 'The set of allowed statuses. How settled a term is; a view publishes some of '
                + 'these and not others.',
        },
        // Held as data for the same reason the rest are: the old serializers each carried their own
        // copy of this list (`const status = ['published','review']`, twice) and an editor could not
        // see it, let alone change it. **Not yet enforced on write** — every migrated term already
        // carries a status, and turning validation on before checking the store against this list
        // would refuse edits to terms nobody has touched.
        values: [
            { status: 'published', label: { en: 'Published' }, skos: null },
            { status: 'review', label: { en: 'In review' }, skos: null },
            { status: 'proposed', label: { en: 'Proposed' }, skos: null },
            { status: 'deprecated', label: { en: 'Deprecated' }, skos: null },
        ],
    },
];

/**
 * Write any seed facet that is not already present.
 *
 * `$setOnInsert` rather than a replace: these lists are editable in the tool, and a boot must never
 * undo an editor's additions.
 *
 * @param {import('mongodb').Collection} facets - The `vocab_facets` collection
 * @returns {Promise<{inserted: number}>}
 */
export async function seedFacets(facets) {
    const writes = FACET_SEEDS.map((facet) => ({
        updateOne: {
            filter: { _id: facet._id },
            update: { $setOnInsert: facet },
            upsert: true,
        },
    }));
    const result = await facets.bulkWrite(writes);
    return { inserted: result.upsertedCount };
}

/**
 * Add seed **values** that a facet already in the store is missing.
 *
 * `seedFacets` cannot do this, and the gap is not obvious: `$setOnInsert` writes a whole facet or
 * nothing, so a value added to a seed above never reaches a store that already holds that facet. It
 * fails quietly and downstream — the value is not in the controlled set, so the SKOS export drops
 * every label using it and the validator refuses the next edit to any term carrying one. `omcToken`
 * was added to `facet:labelType` and did exactly that.
 *
 * **This adds and never removes or rewrites.** A value an editor changed keeps their version; a
 * value they deleted does come back, which is the one cost. Worth paying: the alternative is that a
 * seeded value can never reach an existing store, silently.
 *
 * @param {import('mongodb').Collection} facets - The `vocab_facets` collection
 * @returns {Promise<{added: Array<{facet: string, value: string}>}>}
 */
export async function reconcileFacetValues(facets) {
    const stored = await facets.find({ _id: { $in: FACET_SEEDS.map((facet) => facet._id) } }).toArray();
    const byId = new Map(stored.map((facet) => [facet._id, facet]));

    const added = [];
    const writes = [];

    FACET_SEEDS.forEach((seed) => {
        const held = byId.get(seed._id);
        if (!held) return; // `seedFacets` inserts it whole; nothing to reconcile.

        const have = new Set((held.values ?? []).map((value) => value[seed.key]));
        const missing = (seed.values ?? []).filter((value) => !have.has(value[seed.key]));
        if (!missing.length) return;

        missing.forEach((value) => added.push({ facet: seed._id, value: value[seed.key] }));
        writes.push({
            updateOne: {
                filter: { _id: seed._id },
                update: { $push: { values: { $each: missing } } },
            },
        });
    });

    if (writes.length) await facets.bulkWrite(writes);
    return { added };
}

/**
 * Index the seeds by the value each carries, so a projection can be looked up without a scan.
 *
 * @param {Array<object>} facetDocs - Facet documents, as stored
 * @returns {Map<string, Map<string, (string|null)>>} `appliesTo` → value → SKOS predicate
 */
export function skosProjectionIndex(facetDocs) {
    const byTarget = new Map();
    facetDocs.forEach((facet) => {
        const values = new Map();
        (facet.values ?? []).forEach((value) => {
            values.set(value[facet.key], value.skos ?? null);
        });
        byTarget.set(facet.appliesTo, values);
    });
    return byTarget;
}
