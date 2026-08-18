/**
 * The view the migrated vocabulary publishes through.
 *
 * One seed, not a set. Views are meant to be created for a purpose by whoever has that purpose, and
 * inventing a dozen speculative ones would be inventing requirements. What has to exist on day one
 * is the view that replaces today's single SKOS export — everything in the vocabulary, published as
 * SKOS, so the Explore page and any existing consumer have somewhere to point.
 *
 * @module vocabulary/store/viewSeeds
 */

/**
 * @type {Array<object>}
 */
export const VIEW_SEEDS = [
    {
        _id: 'view:media-creation',
        label: [{ value: 'Media Creation', language: 'en', labelType: 'pref' }],
        definition: {
            en: 'The whole vocabulary, published as SKOS. Replaces the single export the old '
                + 'tool produced, and is what the Explore page reads.',
        },
        root: 'coll:media-creation',
        labelStyle: 'plain',
        // The statuses today's serializers hard-code, kept so this view's output matches what
        // consumers already receive. Every concept in the live data is `published` or `review`, so
        // in practice this currently excludes nothing — which is worth knowing before anyone reads
        // a difference in counts as a bug. A caller can override it per request.
        publish: { status: ['published', 'review'] },
        generators: ['json', 'skos-ttl', 'skos-jsonld', 'csv'],
        seeded: true,
    },
    {
        _id: 'view:omc-controlled-values',
        label: [{ value: 'OMC Controlled Values', language: 'en', labelType: 'pref' }],
        definition: {
            en: 'Every controlled value OMC-JSON defines, named the way OMC-JSON names it, so a '
                + 'build process can regenerate a schema table from it and be sure it is current.',
        },
        root: 'coll:omc-controlled-values',
        // The dotted name **is** the controlled value: `capture` with `witnessCamera` beneath it
        // renders as `capture.witnessCamera`, which is the string the schema holds.
        labelStyle: 'dotted',
        // Rendered from the OMC token, not the preferred label. The two differ, and the difference
        // is exactly what would break a schema — the term reads `Audio` for a person and `audio` in
        // OMC-JSON.
        labelType: 'omcToken',
        // Deliberately unfiltered by status. A drift report has to see a deprecated value in order
        // to report it as deprecated; filtering it out here would make it look as though it had
        // simply gone.
        generators: ['json', 'csv'],
        seeded: true,
    },
];

/**
 * Write any seed view that is not already present.
 *
 * `$setOnInsert`, like the facets: a view is editable, and a boot must not revert somebody's edit.
 *
 * @param {import('mongodb').Collection} views - The `vocab_views` collection
 * @returns {Promise<{inserted: number}>}
 */
export async function seedViews(views) {
    const writes = VIEW_SEEDS.map((view) => ({
        updateOne: {
            filter: { _id: view._id },
            update: { $setOnInsert: view },
            upsert: true,
        },
    }));
    const result = await views.bulkWrite(writes);
    return { inserted: result.upsertedCount };
}
