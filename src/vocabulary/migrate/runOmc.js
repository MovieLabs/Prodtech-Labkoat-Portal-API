/**
 * Merge the OMC-JSON graph into the vocabulary's term store.
 *
 * ```
 * node src/vocabulary/migrate/runOmc.js env=local            # read, build, verify, print. Writes nothing.
 * node src/vocabulary/migrate/runOmc.js env=local --write    # ...then write, only if every check passed
 * ```
 *
 * **Run this after `run.js`, not before.** The merge joins controlled values to terms the SKOS
 * migration wrote, and it adds an `omcToken` label to those terms. `run.js` deletes and re-inserts
 * everything it owns, so running it afterwards would discard those labels — and the view that
 * publishes controlled values would silently fall back to preferred names, turning `audio` into
 * `Audio` in a schema table. Re-running *this* afterwards repairs it.
 *
 * Read-only unless `--write`, and Neo4j is never written to at all.
 *
 * @module vocabulary/migrate/runOmc
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import VocabNeo4j from '../../neo4J/neo4JInterface.js';
import {
    VOCAB_COLLECTIONS,
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    createVocabIndexes,
    vocabCollection,
} from '../store/collections.js';
import { reconcileFacetValues, seedFacets } from '../store/facetSeeds.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';
import { seedViews } from '../store/viewSeeds.js';

import { OMC_TOKEN, buildOmcModel } from './buildOmcModel.js';
import { auditOmcGraph, readOmcGraph } from './readOmcGraph.js';
import { formatOmcChecks, verifyOmcMerge } from './verifyOmc.js';

const heading = ((text) => `\n${text}\n${'-'.repeat(text.length)}`);

/**
 * Write the merged model.
 *
 * Three distinct kinds of write, and the difference matters:
 *
 * 1. **Replace** what a previous run of *this* migration made — its own terms and collections. A
 *    re-run must produce what a first run would have, not the union of the two.
 * 2. **Patch** shared terms with their OMC token. A patch, not a replace: those terms belong to the
 *    vocabulary and this migration knows one fact about them.
 * 3. **Seed** the facets and views, which are `$setOnInsert` and never overwrite an edit.
 *
 * @param {object} model - From `buildOmcModel`
 * @returns {Promise<{patched: number}>}
 */
async function writeOmcModel(model) {
    await createVocabIndexes();
    await seedFacets(vocabCollection(VOCAB_FACETS));
    // A value added to a seed after the facet was first written arrives only here --
    // `seedFacets` writes a facet whole or not at all.
    const reconciled = await reconcileFacetValues(vocabCollection(VOCAB_FACETS));
    reconciled.added.forEach((entry) => console.log(`  + ${entry.facet}: ${entry.value}`));
    await seedViews(vocabCollection(VOCAB_VIEWS));

    await vocabCollection(VOCAB_TERMS).deleteMany({ omcMigrated: true });
    await vocabCollection(VOCAB_COLLECTIONS).deleteMany({ omcMigrated: true });

    if (model.terms.length) await vocabCollection(VOCAB_TERMS).insertMany(model.terms);
    const allCollections = [...model.collections, model.root];
    if (allCollections.length) await vocabCollection(VOCAB_COLLECTIONS).insertMany(allCollections);

    // The token on a shared term. `$pull` first so a re-run after a rename in Neo4j replaces the old
    // token rather than leaving both — two `omcToken` labels would make the rendered name a coin
    // toss, and a coin toss inside a schema value.
    const patches = [...model.tokenPatches.entries()].flatMap(([termId, token]) => ([
        {
            updateOne: {
                filter: { _id: termId },
                update: { $pull: { label: { labelType: OMC_TOKEN } } },
            },
        },
        {
            updateOne: {
                filter: { _id: termId },
                update: {
                    $push: { label: { value: token, language: 'en', labelType: OMC_TOKEN } },
                    $set: { omcTokenFrom: 'omc-merge' },
                },
            },
        },
    ]));

    // Ordered, because the pull for a term must land before its push.
    if (patches.length) await vocabCollection(VOCAB_TERMS).bulkWrite(patches, { ordered: true });

    return { patched: model.tokenPatches.size };
}

async function main() {
    const write = process.argv.includes('--write');
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });

    // ---- read both sides ----

    const neo = await VocabNeo4j({
        dbUri: config.AWS_NEO4J_URI,
        dbUser: config.AWS_NEO4J_USERNAME,
        dbPassword: secrets.LABKOAT.NEO4J_PASSWORD,
        dbDatabase: config.AWS_NEO4J_DATABASE,
    });
    if (!neo.driver) throw new Error('Could not connect to Neo4j');

    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });

    const graph = await readOmcGraph(neo);
    const audit = auditOmcGraph(graph);

    // The vocabulary as it stands, **excluding what this migration owns**. Those are deleted and
    // rewritten below, so counting them as existing would make a second run behave differently from
    // a first: every term it minted last time would read as a collision, and every value it minted
    // would read as already defined by the vocabulary. Re-runnable means producing what a first run
    // would have produced, not the union of the two.
    const stored = await vocabCollection(VOCAB_TERMS)
        .find({ omcMigrated: { $ne: true } })
        .toArray();
    const existingTerms = new Map(stored.map((term) => [term._id, term]));

    console.log(heading('Source graph (OMC)'));
    console.log(`  nodes ${audit.nodeCount}, edges ${audit.edgeCount}`);
    console.log('  by kind:', audit.byKind);
    console.log('  by relation:', audit.byRelation);
    console.log(`  ${audit.controlledValues} controlled values, ${audit.withSkosDefinition} with a SKOS definition`);
    console.log(`  vocabulary holds ${existingTerms.size} terms`);

    if (audit.problems.misfiledSubValues) {
        console.log(`  ! ${audit.problems.misfiledSubValues} hasSubValue edges start at a Property rather than a `
            + 'ControlledValue. Read as top-level values rather than dropped — they carry four '
            + 'values the Asset function table needs.');
    }
    if (audit.problems.unreachable) {
        console.log(`  ! ${audit.problems.unreachable} controlled values nothing points at:`, audit.problems.unreachableSample);
    }
    if (audit.problems.ambiguous.length) {
        console.log(`  ! ${audit.problems.ambiguous.length} values point at more than one concept:`, audit.problems.ambiguous.slice(0, 5));
    }
    if (audit.problems.dangling) console.log(`  ! ${audit.problems.dangling} dangling edges`);
    audit.problems.duplicated.forEach((entry) => {
        console.log(`  ! ${entry.relation}: ${entry.total} edges over ${entry.distinct} distinct pairs`);
    });

    // ---- build ----

    const model = buildOmcModel(graph, existingTerms);

    console.log(heading('Merged model'));
    const { report } = model;
    console.log(`  ${report.properties} property collections, ${report.placements} placements `
        + `(${report.nested} nested)`);
    console.log(`  ${report.joinedToExistingTerm} placements joined to terms the vocabulary already held`);
    console.log(`  ${report.mintedNewTerm} terms minted for values nobody had written down`);
    console.log(`  ${model.tokenPatches.size} existing terms gain an OMC token`);

    if (report.pointingAtMissingTerm.length) {
        console.log(`  ! ${report.pointingAtMissingTerm.length} values point at a concept the vocabulary `
            + 'does not hold — the string join failing, visibly:', report.pointingAtMissingTerm.slice(0, 5));
    }
    if (report.definitionDisagreements.length) {
        console.log(`  ! ${report.definitionDisagreements.length} definitions disagree between OMC and the `
            + 'vocabulary. The vocabulary wins; one of the two copies is stale.');
        report.definitionDisagreements.slice(0, 3).forEach((entry) => {
            console.log(`      ${entry.term}\n        omc: ${entry.omc}\n        voc: ${entry.vocabulary}`);
        });
    }
    if (report.unreachableValues.length) {
        console.log(`  ! ${report.unreachableValues.length} controlled values were not placed:`, report.unreachableValues.slice(0, 6));
    }

    // ---- verify ----

    console.log(heading('Checks'));
    const result = verifyOmcMerge({ graph, model, existingTerms });
    console.log(formatOmcChecks(result));

    if (!write) {
        console.log('\nDry run. Pass --write to store this.');
        await neo.driver.close();
        await closeVocabMongo();
        return;
    }

    if (!result.pass) {
        await neo.driver.close();
        await closeVocabMongo();
        throw new Error('Verification failed — nothing written');
    }

    const { patched } = await writeOmcModel(model);
    console.log(heading('Written'));
    console.log(`  ${model.terms.length} terms, ${model.collections.length + 1} collections, `
        + `${patched} terms patched with an OMC token`);

    await neo.driver.close();
    await closeVocabMongo();
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
