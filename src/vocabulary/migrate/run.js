/**
 * Migrate the SKOS vocabulary out of Neo4j and into Mongo.
 *
 * ```
 * node src/vocabulary/migrate/run.js env=local            # read, build, verify, print. Writes nothing.
 * node src/vocabulary/migrate/run.js env=local --write    # the same, then write if every check passed
 * ```
 *
 * **Read-only unless `--write` is given, and Neo4j is never written to at all.** The old vocabulary
 * stays authoritative through this whole stage: the point is to run this repeatedly, read the
 * report, fix the mapping, and run it again, until the numbers are right. Only then does anything
 * depend on the result.
 *
 * A run that fails verification writes nothing, even with `--write`. A half-migrated store is worse
 * than none, because it looks finished.
 *
 * @module vocabulary/migrate/run
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import VocabNeo4j from '../../neo4J/neo4JInterface.js';
import {
    ALL_VOCAB_COLLECTIONS,
    VOCAB_COLLECTIONS,
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    createVocabIndexes,
    vocabCollection,
} from '../store/collections.js';
import { reconcileFacetValues, seedFacets } from '../store/facetSeeds.js';
import { raiseTermCounter, termIdNumber } from '../store/ids.js';
import { closeVocabMongo, initializeVocabMongo, vocabDatabase } from '../store/mongoConnection.js';
import { seedViews } from '../store/viewSeeds.js';

import { buildModel, buildRootCollection, buildUnplacedCollection } from './buildModel.js';
import { auditGraph, readSkosGraph } from './readGraph.js';
import { formatChecks, verifyMigration } from './verify.js';

const heading = ((text) => `\n${text}\n${'-'.repeat(text.length)}`);

/**
 * Write the built model, replacing whatever a previous run left.
 *
 * A full replace of the migrated documents rather than a merge: the migration is a projection of
 * Neo4j, so a second run must produce exactly what a first run would have, not the union of the
 * two. Re-runnable is the property that makes it safe to iterate on.
 *
 * @param {object} model - `{ terms, collections }` plus the root
 * @returns {Promise<void>}
 */
async function writeModel({ terms, collections, root }) {
    await createVocabIndexes();
    await seedFacets(vocabCollection(VOCAB_FACETS));
    // A value added to a seed after the facet was first written arrives only here --
    // `seedFacets` writes a facet whole or not at all.
    const reconciled = await reconcileFacetValues(vocabCollection(VOCAB_FACETS));
    reconciled.added.forEach((entry) => console.log(`  + ${entry.facet}: ${entry.value}`));
    await seedViews(vocabCollection(VOCAB_VIEWS));

    // Only documents this migration produced. A term somebody authored in the new tool is not the
    // migration's to remove.
    await vocabCollection(VOCAB_TERMS).deleteMany({ migrated: true });
    await vocabCollection(VOCAB_COLLECTIONS).deleteMany({ migrated: true });

    if (terms.length) await vocabCollection(VOCAB_TERMS).insertMany(terms);
    const allCollections = [...collections, root];
    if (allCollections.length) await vocabCollection(VOCAB_COLLECTIONS).insertMany(allCollections);

    // The migration keeps every existing id, so the counter has to start above the highest one it
    // imported — otherwise the first term anyone creates collides with one of these.
    const highest = terms
        .map((term) => termIdNumber(term._id))
        .filter((value) => value !== null)
        .reduce((max, value) => Math.max(max, value), 0);
    await raiseTermCounter(highest);
}

async function main() {
    const write = process.argv.includes('--write');

    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });

    // ---- read ----

    const neo = await VocabNeo4j({
        dbUri: config.AWS_NEO4J_URI,
        dbUser: config.AWS_NEO4J_USERNAME,
        dbPassword: secrets.LABKOAT.NEO4J_PASSWORD, // as vocabSetup reads it
        dbDatabase: config.AWS_NEO4J_DATABASE,
    });
    if (!neo.driver) throw new Error('Could not connect to Neo4j');

    const graph = await readSkosGraph(neo);
    const audit = auditGraph(graph);

    console.log(heading('Source graph'));
    console.log(`  nodes ${audit.nodeCount}, edges ${audit.edgeCount}`);
    console.log('  by type:', audit.byType);
    console.log('  by relation:', audit.byRelation);
    if (audit.problems.dangling) {
        console.log(`  ! ${audit.problems.dangling} dangling edges (dropped):`, audit.problems.danglingSample);
    }
    audit.problems.duplicated.forEach((entry) => {
        console.log(`  ! ${entry.relation}: ${entry.total} edges over ${entry.distinct} distinct pairs `
            + `(${entry.duplicates} duplicated). Harmless here — read through Sets — but the graph `
            + 'is asserting the same fact more than once.');
    });
    if (audit.problems.halfPairs) {
        console.log(`  ! ${audit.problems.halfPairs} one-sided inverse pairs (union taken):`, audit.problems.halfPairsSample);
    }

    // ---- build ----

    const { terms, collections, unplaced, report } = buildModel(graph);
    // Terms in no scheme are gathered rather than dropped -- the old serializer emitted them, and a
    // view publishes a collection, so without this they would silently stop appearing.
    const unplacedCollection = buildUnplacedCollection(unplaced);
    const allSchemes = unplacedCollection ? [...collections, unplacedCollection] : collections;
    const root = buildRootCollection(allSchemes);

    console.log(heading('Built model'));
    Object.entries(report).forEach(([key, value]) => {
        console.log(`  ${key}:`, value);
    });

    // ---- verify ----

    console.log(heading('Checks'));
    const result = verifyMigration({ graph, terms, collections: allSchemes, root });
    console.log(formatChecks(result));

    if (!write) {
        console.log('\nDry run. Pass --write to store this.');
        await neo.driver.close();
        return;
    }

    if (!result.pass) {
        await neo.driver.close();
        throw new Error('Verification failed — nothing written');
    }

    // ---- write ----

    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });

    await writeModel({ terms, collections: allSchemes, root });

    const stored = await Promise.all(
        ALL_VOCAB_COLLECTIONS.map(async (name) => `${name}: ${await vocabDatabase().collection(name).countDocuments()}`),
    );
    console.log(heading('Written'));
    stored.forEach((line) => console.log(`  ${line}`));

    await closeVocabMongo();
    await neo.driver.close();
}

main()
    .then(() => process.exit(0))
    .catch((err) => {
        console.error('\nMigration failed:', err.message);
        console.error(err);
        process.exit(1);
    });
