/**
 * Produce an edge artifact from the command line.
 *
 * ```
 * node src/vocabulary/edges/generate.js --format markdown
 * node src/vocabulary/edges/generate.js --format matrix-csv --out matrix.csv
 * node src/vocabulary/edges/generate.js --list
 * ```
 *
 * The same generators the API serves, run with no service in the path — so a build step elsewhere can
 * produce the OMC-JSON edge definitions, or a reviewer can read the tables, without the Portal or a
 * running API. A sibling of `vocabulary/generate.js`, which does this for a view.
 *
 * @module vocabulary/edges/generate
 */

import fs from 'fs/promises';

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';

import { edgeFormats, generateEdges } from './generators/index.js';

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
        console.log('Formats:');
        edgeFormats().forEach(({ format, label, extension }) => console.log(`  ${format}  ${label} (.${extension})`));
        return;
    }

    const artifact = await generateEdges({
        format: options.format ?? 'json',
        status: typeof options.status === 'string' ? options.status.split(',') : null,
    });

    const payload = typeof artifact.body === 'string' ? artifact.body : JSON.stringify(artifact.body, null, 2);

    if (options.out) {
        await fs.writeFile(options.out, payload, 'utf8');
        console.log(`Wrote ${options.out} (${payload.length} bytes)`);
    } else {
        process.stdout.write(payload);
    }

    // To stderr, so they are visible while the artifact is piped and never end up inside it.
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
