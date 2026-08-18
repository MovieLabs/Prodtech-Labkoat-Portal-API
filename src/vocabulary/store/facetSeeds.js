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
        label: { en: 'Label Type' },
        definition: { en: 'What kind of name this is.' },
        values: [
            // Exactly one `pref` per language per term — enforced on write, not here. This is the
            // one cost of collapsing prefLabel into the label array, and it is worth paying: a
            // preferred name is a kind of name, not a different field.
            { labelType: 'pref', label: { en: 'Preferred' }, skos: 'skos:prefLabel' },
            { labelType: 'alternate', label: { en: 'Alternate' }, skos: 'skos:altLabel' },
            { labelType: 'synonym', label: { en: 'Synonym' }, skos: 'skos:altLabel' },
            { labelType: 'abbreviation', label: { en: 'Abbreviation' }, skos: 'skos:altLabel' },
            { labelType: 'acronym', label: { en: 'Acronym' }, skos: 'skos:altLabel' },
            // A known-wrong spelling, recorded so a search can find it. `hiddenLabel` is exactly
            // what SKOS provides for this and the old model had no way to say it.
            { labelType: 'misspelling', label: { en: 'Misspelling' }, skos: 'skos:hiddenLabel' },
        ],
    },
    {
        _id: 'facet:noteType',
        appliesTo: 'note',
        key: 'noteType',
        label: { en: 'Note Type' },
        definition: { en: 'What kind of note this is, and who it is for.' },
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
        label: { en: 'Example Type' },
        definition: { en: 'Whether this is an example of use, or a link to one.' },
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
            en: 'Whether a term in the Departments and Roles collection names a department or a '
                + 'role. The distinction was previously only inferable from context.',
        },
        // Tag facets carry no `skos`: a tag is a view's own designation, and it projects only where
        // a generator asks for it.
        values: [
            { tag: 'department', label: { en: 'Department' } },
            { tag: 'role', label: { en: 'Role' } },
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
