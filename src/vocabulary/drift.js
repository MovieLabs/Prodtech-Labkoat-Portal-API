/**
 * Report drift between a view and a JSON Schema, from the command line.
 *
 * ```
 * node src/vocabulary/drift.js --schema ../omcUtil/src/omc/validation/schema/OMC-JSON-v3.0.schema.json
 * node src/vocabulary/drift.js --schema <path> --json --out drift.json
 * node src/vocabulary/drift.js --schema <path> --view view:omc-controlled-values
 * ```
 *
 * **The schema is a path, not an import.** This system never depends on `omc-util`; the schema is a
 * JSON document handed in, and the report says only what is in it. The merge back into the schema
 * belongs to whoever owns the schema — this produces the evidence for it.
 *
 * Read-only. Nothing here writes to either store.
 *
 * @module vocabulary/drift
 */

import fs from 'fs/promises';

import { awsSecrets } from 'mlHelpers';

import config from '../config.js';

import { driftReport, formatDrift } from './driftReport.js';
import { closeVocabMongo, initializeVocabMongo } from './store/mongoConnection.js';

/**
 * `--name value` and `--flag` from argv.
 *
 * @returns {Object<string, string|boolean>}
 */
function args() {
    const parsed = {};
    process.argv.slice(2).forEach((arg, index, all) => {
        if (!arg.startsWith('--')) return;
        const name = arg.slice(2);
        const next = all[index + 1];
        parsed[name] = next && !next.startsWith('--') ? next : true;
    });
    return parsed;
}

async function main() {
    const options = args();

    if (typeof options.schema !== 'string') {
        throw new Error('--schema <path to a JSON Schema document> is required');
    }

    const schema = JSON.parse(await fs.readFile(options.schema, 'utf8'));

    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });

    const report = await driftReport({
        viewId: typeof options.view === 'string' ? options.view : 'view:omc-controlled-values',
        schema,
        status: typeof options.status === 'string' ? options.status.split(',') : null,
    });

    const text = options.json ? JSON.stringify(report, null, 2) : formatDrift(report);

    if (options.out) {
        await fs.writeFile(options.out, text, 'utf8');
        console.log(`Wrote ${options.out}`);
    } else {
        console.log(text);
    }

    await closeVocabMongo();
}

main().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
