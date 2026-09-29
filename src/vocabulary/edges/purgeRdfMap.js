/**
 * Remove the stored `rdfMap` from every edge, once.
 *
 * `rdfMap` held curated notes naming the v2.8 `omc.ttl` property that expressed the same
 * relationship — hand-written in omcUtil's edges.js before this tool existed and seeded in from
 * there. The published `rdf` projection names the current model, so the notes are no longer
 * stored, published or displayed. What remains is the copy on documents written before that change,
 * which nothing reads. This unsets it.
 *
 * ```
 * node src/vocabulary/edges/purgeRdfMap.js            # dry run: report what would change
 * node src/vocabulary/edges/purgeRdfMap.js --write    # apply it
 * ```
 *
 * Dry run by default, and it prints a sample of what it would drop so the values can be read one
 * last time before they go. `--write` is not reversible: there is no copy of these notes anywhere
 * else except omcUtil's parked edges.js, which is where they came from.
 *
 * Delete this file once it has been run.
 *
 * @module vocabulary/edges/purgeRdfMap
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_EDGES } from '../store/collections.js';
import { closeVocabMongo, initializeVocabMongo, vocabDatabase } from '../store/mongoConnection.js';

/** The two places a direction keeps its notes. */
const FIELDS = ['forward.rdfMap', 'reverse.rdfMap'];

async function connect() {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });
}

async function main() {
    const write = process.argv.includes('--write');
    await connect();
    const edges = vocabDatabase().collection(VOCAB_EDGES);

    const holds = { $or: FIELDS.map((field) => ({ [field]: { $exists: true } })) };
    const total = await edges.countDocuments({});
    const affected = await edges.countDocuments(holds);

    console.log(`${VOCAB_EDGES}: ${total} edges, ${affected} still holding rdfMap`);

    if (!affected) {
        console.log('Nothing to purge.');
        return;
    }

    const sample = await edges.find(holds).limit(5)
        .project({ '_id': 1, 'forward.rdfMap': 1, 'reverse.rdfMap': 1 })
        .toArray();
    console.log('\nA sample of what would be dropped:');
    sample.forEach((edge) => {
        const notes = [...(edge.forward?.rdfMap ?? []), ...(edge.reverse?.rdfMap ?? [])];
        console.log(`  ${edge._id}  ${notes.length ? notes.map((n) => JSON.stringify(n)).join(', ') : '(empty array)'}`);
    });

    if (!write) {
        console.log(`\nDry run. Nothing written. Re-run with --write to unset ${FIELDS.join(' and ')}.`);
        return;
    }

    const result = await edges.updateMany(holds, {
        $unset: Object.fromEntries(FIELDS.map((field) => [field, ''])),
    });
    console.log(`\nMatched ${result.matchedCount}, modified ${result.modifiedCount}.`);

    const left = await edges.countDocuments(holds);
    console.log(left ? `WARNING: ${left} still hold rdfMap.` : 'None left.');
}

main()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => closeVocabMongo());
