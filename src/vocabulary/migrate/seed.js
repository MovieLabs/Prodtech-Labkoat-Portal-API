/**
 * Bring a vocabulary store up to date without rebuilding it.
 *
 * ```
 * node src/vocabulary/migrate/seed.js env=local            # report what would change
 * node src/vocabulary/migrate/seed.js env=local --write    # apply it
 * ```
 *
 * Distinct from `run.js` and `runOmc.js`, which read a source and rebuild what they own. This only
 * applies what ships with the code: the indexes, and the facet and view seeds. It touches nothing
 * anybody edited, so it is safe to run on a live store.
 *
 * @module vocabulary/migrate/seed
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import {
    VOCAB_FACETS,
    VOCAB_VIEWS,
    createVocabIndexes,
    vocabCollection,
} from '../store/collections.js';
import { reconcileFacetValues, seedFacets } from '../store/facetSeeds.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';
import { VIEW_SEEDS, seedViews } from '../store/viewSeeds.js';

/**
 * Give a seeded view the ontology URI its seed declares, where it has none.
 *
 * `seedViews` is `$setOnInsert`, so a view that already existed never sees a field added to its seed
 * later — which is right for anything editable and wrong for this: without the URI a view cannot be
 * named as an artifact, and a union gathering it cannot declare the import. Applied only where the
 * field is absent, and only to views the seeds own, so an edited URI is never overwritten.
 *
 * @param {boolean} write
 * @returns {Promise<{pending: number, set: number}>}
 */
async function backfillOntologies(write) {
    const views = vocabCollection(VOCAB_VIEWS);
    const pending = VIEW_SEEDS.filter((seed) => seed.ontology);

    if (!write) return { pending: pending.length, set: 0 };

    const writes = pending.map((seed) => ({
        updateOne: {
            filter: { _id: seed._id, ontology: { $exists: false } },
            update: { $set: { ontology: seed.ontology } },
        },
    }));
    const result = await views.bulkWrite(writes);
    return { pending: pending.length, set: result.modifiedCount };
}

async function main() {
    const write = process.argv.includes('--write');
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });

    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });

    if (!write) {
        console.log('\nNothing written. Re-run with --write to apply.');
        await closeVocabMongo();
        return;
    }

    await createVocabIndexes();
    await seedFacets(vocabCollection(VOCAB_FACETS));
    // A value added to a seed after the facet was first written arrives only here — `seedFacets`
    // writes a facet whole or not at all.
    const facets = await reconcileFacetValues(vocabCollection(VOCAB_FACETS));
    const seededViews = await seedViews(vocabCollection(VOCAB_VIEWS));
    const ontologies = await backfillOntologies(true);

    console.log(`\nfacet values reconciled: ${facets.added ?? 0}`);
    console.log(`views seeded: ${seededViews.inserted}`);
    console.log(`view ontologies set: ${ontologies.set}`);

    await closeVocabMongo();
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
