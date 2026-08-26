/**
 * The view the migrated vocabulary publishes through.
 *
 * Two seeds, not a set. Views are meant to be created for a purpose by whoever has that purpose,
 * and inventing a dozen speculative ones would be inventing requirements. What has to exist is the
 * view that replaces today's single SKOS export, and the union it is published under.
 *
 * **`view:omc-controlled-values` was one of these and is gone**, along with the 33 collections it
 * read. That arrangement was a parallel copy of terms Media Creation already held, taken from the
 * OMC graph during the move off Neo4j, and it is replaced by one composed from the Media Creation
 * hierarchy itself. What it published on the day it went is kept under `snapshots/`.
 *
 * ## `ontology` is what makes a union expressible
 *
 * A view names the URI its artifact is published as. A view whose root gathers other views' roots
 * then declares that composition with `owl:imports`, derived at resolve time. That is the whole
 * mechanism: the aggregate is named at the ontology level, and nothing in SKOS's concept vocabulary
 * has to change — no scheme is retyped, no identifier means two things in two documents.
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
        // What it attaches is filled in by the migration, which is what knows the schemes it made.
        // A view is the root; there is no collection above these.
        member: [],
        // The artifact's own identity. Named here so a view that gathers this one can declare the
        // composition with `owl:imports` rather than inventing a structure SKOS cannot express.
        ontology: 'https://mc.movielabs.com/vmc/media-creation',
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
        _id: 'view:all-vocab',
        label: [{ value: 'All Vocabulary', language: 'en', labelType: 'pref' }],
        definition: {
            en: 'Every MovieLabs vocabulary published as one artifact. Each is developed and '
                + 'published independently; this gathers their roots, so it is always the current '
                + 'union rather than a copy taken at some past moment.',
        },
        member: [],
        // The name of the whole. Every vocabulary it gathers keeps its own ontology, and this one
        // declares what it is made of with `owl:imports` — which is where an aggregate belongs,
        // because SKOS has no aggregate of schemes and adding one would mean retyping a scheme as
        // something else in this artifact but not in its own.
        ontology: 'https://mc.movielabs.com/vmc',
        labelStyle: 'plain',
        // Matching Media Creation's, so gathering a vocabulary does not silently publish more of it
        // than its own view does. An inclusion can narrow this per vocabulary with `filter.status`
        // where two of them are ready at different points.
        publish: { status: ['published', 'review'] },
        generators: ['json', 'skos-ttl', 'skos-jsonld', 'csv'],
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
