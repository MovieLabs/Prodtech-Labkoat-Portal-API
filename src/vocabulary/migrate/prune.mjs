/**
 * Remove stored fields nothing reads.
 *
 * ```
 * node src/vocabulary/migrate/prune.mjs            # counts only
 * node src/vocabulary/migrate/prune.mjs --write    # unset them
 * ```
 *
 * Every field below was written by something and read by nothing. Two are worth naming: `legacy` is
 * an untyped bag of every Neo4j property the SKOS migration did not recognise, and
 * `omcSource`/`omcTokenFrom` record which merge touched a term — which the merge scripts do not
 * consult on a re-run.
 *
 * The migration markers stay — `migrated` and `omcMigrated` are how `migrate/run.js` and
 * `migrate/runOmc.js` find what they wrote in order to replace it, so removing them would strand
 * a rebuild.
 *
 * Dry by default: it prints what it would touch and writes nothing without `--write`.
 *
 * @module vocabulary/migrate/prune
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_COLLECTIONS, VOCAB_TERMS, VOCAB_VIEWS, vocabCollection } from '../store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';

/** Field → the collection it sits on. */
const PRUNE = {
    [VOCAB_TERMS]: ['omcSource', 'omcTokenFrom', 'legacy', 'labelDisagreement'],
    [VOCAB_COLLECTIONS]: ['extractedFrom', 'seeded', 'skosAs', 'forkedFrom'],
    [VOCAB_VIEWS]: ['overlay', 'tagScheme', 'seeded'],
};

const APPLY = process.argv.includes('--write');

const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({
    username: secrets.FMAM.FMAM_MONGO_USER,
    password: secrets.FMAM.FMAM_MONGO_PASSWORD,
    mongoUrl: config.VOCAB_MONGO_URL,
});

let total = 0;

for (const [name, fields] of Object.entries(PRUNE)) {
    const store = vocabCollection(name);
    console.log(`\n${name}`);
    for (const field of fields) {
        const count = await store.countDocuments({ [field]: { $exists: true } });
        total += count;
        console.log(`  ${field.padEnd(20)} ${String(count).padStart(5)}`);
        if (APPLY && count) {
            await store.updateMany({ [field]: { $exists: true } }, { $unset: { [field]: '' } });
        }
    }
}

console.log(`\n${total} documents carry at least one of these.`);
console.log(APPLY ? 'Unset.' : 'Dry run — pass --write to apply.');
await closeVocabMongo();
