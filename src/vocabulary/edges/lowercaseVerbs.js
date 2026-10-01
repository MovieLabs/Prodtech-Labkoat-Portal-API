/**
 * Lower-case the first letter of every predicate-pair verb, once.
 *
 * A verb is a verb whichever placement its side takes, and an intrinsic side was authored
 * capitalised — `Member`, `Product`, `Role` — so the OMC-JSON predicate kept the capital while the
 * RDF name lower-cased it. The two projections then spelt one verb two ways, and `edgeTable.js` had
 * to fold case to match a row to its RDF property: a spelling difference doing the work of a join key.
 *
 * ```
 * node src/vocabulary/edges/lowercaseVerbs.js            # dry run: report what would change
 * node src/vocabulary/edges/lowercaseVerbs.js --write    # apply it, then regenerate edge names
 * ```
 *
 * **RDF names do not move.** Every affected pair templates its RDF name from `{verb}`, which
 * lower-cases the first letter already, so `omc:member` is produced either way. What changes is the
 * OMC-JSON predicate, which an intrinsic relationship does not use — its path is the whole of it.
 *
 * A rename is refused if the lower-case form is already another pair's verb; `replacePair` validates
 * that. Edge names are regenerated afterwards through `acceptNames`, which keeps every override.
 *
 * Delete this file once it has been run.
 *
 * @module vocabulary/edges/lowercaseVerbs
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_EDGES, vocabCollection } from '../store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';

import { acceptNames, listPairs, replacePair } from './store.js';

const DIRECTIONS = ['forward', 'reverse'];
const lower = ((verb) => verb.charAt(0).toLowerCase() + verb.slice(1));

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

    const pairs = await listPairs();
    const taken = new Set(pairs.flatMap((pair) => DIRECTIONS.map((d) => pair[d]?.verb).filter(Boolean)));

    const moving = pairs
        .map((pair) => ({
            pair,
            renames: DIRECTIONS
                .filter((d) => pair[d]?.verb && pair[d].verb !== lower(pair[d].verb))
                .map((d) => ({ direction: d, from: pair[d].verb, to: lower(pair[d].verb) })),
        }))
        .filter(({ renames }) => renames.length);

    console.log(`${pairs.length} pairs; ${moving.length} with a capitalised verb`);

    const clashes = moving.flatMap(({ renames }) => renames.filter((r) => taken.has(r.to)));
    if (clashes.length) {
        console.error(`\nRefusing: ${clashes.map((c) => `${c.from} -> ${c.to}`).join(', ')} already in use.`);
        process.exitCode = 1;
        return;
    }

    moving.forEach(({ pair, renames }) => renames.forEach((r) => console.log(
        `  ${pair._id}  ${r.direction.padEnd(8)} ${r.from} -> ${r.to}`,
    )));

    const ids = moving.map(({ pair }) => pair._id);
    const affected = await vocabCollection(VOCAB_EDGES).countDocuments({ pair: { $in: ids } });
    console.log(`\n${affected} edges use these pairs and will have their names regenerated`);

    if (!write) {
        console.log('\nDry run. Nothing written. Re-run with --write.');
        return;
    }

    for (const { pair, renames } of moving) {
        const next = { ...pair };
        renames.forEach((r) => {
            next[r.direction] = { ...pair[r.direction], verb: r.to };
        });
        await replacePair(pair._id, next, 'lowercaseVerbs');
        console.log(`  renamed ${pair._id}`);
    }

    const edgeIds = (await vocabCollection(VOCAB_EDGES).find({ pair: { $in: ids } })
        .project({ _id: 1 }).toArray()).map((e) => e._id);
    const accepted = await acceptNames(edgeIds, 'lowercaseVerbs');
    console.log(`\nRegenerated names on ${accepted.length} edges.`);

    const left = (await listPairs()).flatMap((pair) => DIRECTIONS
        .filter((d) => pair[d]?.verb && pair[d].verb !== lower(pair[d].verb))
        .map((d) => pair[d].verb));
    console.log(left.length ? `WARNING: still capitalised: ${left.join(', ')}` : 'No capitalised verbs left.');
}

main()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => closeVocabMongo());
