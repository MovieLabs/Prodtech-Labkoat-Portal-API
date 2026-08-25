/**
 * Collections that exist because a view needs somewhere to point — and there are none.
 *
 * **A view is the root.** It holds its own members, so it needs no collection to point at, and a
 * collection that heads no term is not a thing in the vocabulary. `coll:all-vocab` was the last of
 * them and is gone; a union view attaches the vocabularies it gathers directly.
 *
 * The seeding function stays because `migrate/seed.js` calls it and a future seed may want it.
 *
 * ---
 *
 *
 * ## Why the union is a collection of roots and nothing more
 *
 * MovieLabs publishes several vocabularies that are developed independently, by different people
 * with different agendas, each serving its own audience — and it also publishes the whole. The whole
 * is **not a structure**. SKOS has no scheme-of-schemes and needs none: publishing two vocabularies
 * together is publishing the union of their triples, with every scheme keeping one identifier and
 * one type.
 *
 * That matters because the tempting alternative is broken. `skos:ConceptScheme`, `skos:Concept` and
 * `skos:Collection` are mutually disjoint (SKOS Reference S9, S12), so a collection that is a scheme
 * in its own artifact and something else in the combined one is a contradiction across two published
 * documents. And `skos:member` cannot hold a ConceptScheme, so a Collection-of-schemes cannot be
 * built either.
 *
 * The union is therefore a **transparent** collection whose members are other vocabularies' roots.
 * It emits nothing itself; each vocabulary's schemes come through unchanged, as siblings, every term
 * keeping its own `inScheme`. The name of the whole lives on the ontology instead — see
 * `viewSeeds.js` and `importsOf` in the resolver.
 *
 * **The inclusion is live.** A term added to Audio tomorrow is in the next union export without
 * anybody republishing anything, which is the point of gathering roots rather than copying them.
 *
 * @module vocabulary/store/collectionSeeds
 */

/**
 * @type {Array<object>}
 */
export const COLLECTION_SEEDS = [];

/**
 * Write any seed collection that is not already present.
 *
 * `$setOnInsert`, like the views and the facets: a collection is editable, and a boot must not
 * revert an arrangement somebody made.
 *
 * @param {import('mongodb').Collection} collections - The `vocab_collections` collection
 * @returns {Promise<{inserted: number}>}
 */
export async function seedCollections(collections) {
    const writes = COLLECTION_SEEDS.map((collection) => ({
        updateOne: {
            filter: { _id: collection._id },
            update: { $setOnInsert: collection },
            upsert: true,
        },
    }));
    const result = await collections.bulkWrite(writes);
    return { inserted: result.upsertedCount };
}
