/**
 * Produce a view's artifact from the command line.
 *
 * ```
 * node src/vocabulary/generate.js --view view:media-creation --format skos-ttl
 * node src/vocabulary/generate.js --view view:media-creation --format csv --out vocab.csv
 * node src/vocabulary/generate.js --list
 * ```
 *
 * The same generators the API serves, run with no service in the path. That is the point: a build
 * step in another repository can fetch a view over HTTP, or a script with database credentials can
 * produce the artifact directly, and both get byte-identical output because both call `generate`.
 *
 * @module vocabulary/generate
 */

import fs from 'fs/promises';

import { awsSecrets } from 'mlHelpers';

import config from '../config.js';

import { generate, generatorNames } from './generators/index.js';
import { closeVocabMongo, initializeVocabMongo } from './store/mongoConnection.js';
import { listViews } from './store/read.js';

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

async function connect() {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });
}

async function main() {
    const options = args();
    await connect();

    if (options.list) {
        const views = await listViews();
        console.log('Views:');
        views.forEach((view) => console.log(`  ${view._id}  (${(view.member ?? []).length} attached)`));
        console.log(`\nFormats: ${generatorNames().join(', ')}`);
        return;
    }

    if (!options.view) {
        throw new Error('--view is required. Use --list to see what exists.');
    }

    const artifact = await generate({
        viewId: options.view,
        format: options.format ?? 'json',
        status: typeof options.status === 'string' ? options.status.split(',') : null,
        language: typeof options.language === 'string' ? options.language : undefined,
    });

    // **A Buffer is written as it stands.** A workbook and a zip are binary, and the string branch
    // below would turn either into `{"type":"Buffer",...}` — a valid JSON document and an unopenable
    // spreadsheet, failing when somebody opens the file rather than when it is written.
    const binary = Buffer.isBuffer(artifact.body);
    let payload = artifact.body;
    if (!binary && typeof payload !== 'string') payload = JSON.stringify(payload, null, 2);

    if (options.out) {
        await fs.writeFile(options.out, payload, binary ? undefined : 'utf8');
        console.log(`Wrote ${options.out} (${payload.length} bytes)`);
    } else if (binary) {
        // Piping a workbook to a terminal writes control characters over whatever is on screen and
        // tells the reader nothing. `--out` is the only sensible way to take a binary format.
        console.error(`${options.format} is binary — use --out to write it to a file.`);
        process.exitCode = 1;
    } else {
        process.stdout.write(payload);
    }

    // Problems go to stderr so they are visible when the artifact is being piped, and so they never
    // end up inside the artifact. A view that dropped a hundred terms and one that dropped none
    // otherwise produce documents that look equally complete.
    const problems = Object.entries(artifact.problems ?? {})
        .filter(([, value]) => (Array.isArray(value) ? value.length : value));
    if (problems.length) {
        console.error('\nProblems:');
        problems.forEach(([key, value]) => {
            console.error(`  ${key}:`, Array.isArray(value) ? value.slice(0, 5) : value);
        });
    }
}

main()
    .then(async () => {
        await closeVocabMongo();
        process.exit(0);
    })
    .catch(async (err) => {
        console.error(err.message);
        await closeVocabMongo();
        process.exit(1);
    });
