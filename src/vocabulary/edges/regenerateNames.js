/**
 * Regenerate every edge's names, once.
 *
 * An intrinsic direction used to be given a capitalised predicate — `Has` for the verb `has` — so
 * that a verb placed as a property could not collide with the same verb placed under `edges` in a
 * publication keyed by predicate. Placement now travels with the pairing, so the collision cannot
 * happen and the predicate is the verb whichever placement it takes. The stored names still hold the
 * capitalised form: they are written on save, not on publish, so an edge nobody touches keeps it.
 *
 * ```
 * node src/vocabulary/edges/regenerateNames.js            # dry run: report what would change
 * node src/vocabulary/edges/regenerateNames.js --write    # apply it
 * ```
 *
 * This is `acceptNames` over every edge, which is what a person does one edge at a time after
 * reading the check. **Overrides are kept** — a name somebody typed is a decision and is not
 * touched. What changes is the generated value.
 *
 * Delete this file once it has been run.
 *
 * @module vocabulary/edges/regenerateNames
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';

import { acceptNames, listEdges, loadEdgeContext, withNames } from './store.js';

const NAME_FIELDS = ['placement', 'predicate', 'path', 'rdfName'];

async function connect() {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });
}

/** Every name whose generated value would move, per edge direction. */
const changesIn = ((was, next) => ['forward', 'reverse'].flatMap((direction) => NAME_FIELDS
    .map((field) => ({
        direction,
        field,
        from: was[direction]?.names?.[field]?.value ?? null,
        to: next[direction]?.names?.[field]?.value ?? null,
        overridden: was[direction]?.names?.[field]?.override != null,
    }))
    .filter((change) => change.from !== change.to)));

async function main() {
    const write = process.argv.includes('--write');
    await connect();
    const [context, edges] = await Promise.all([loadEdgeContext(), listEdges()]);

    const moving = edges
        .map((edge) => ({ edge, changes: changesIn(edge, withNames(edge, context)) }))
        .filter(({ changes }) => changes.length);

    console.log(`${edges.length} edges; ${moving.length} whose generated names have moved`);
    if (!moving.length) {
        console.log('Nothing to regenerate.');
        return;
    }

    const byField = {};
    moving.forEach(({ changes }) => changes.forEach(({ field }) => {
        byField[field] = (byField[field] ?? 0) + 1;
    }));
    console.log(`by field: ${Object.entries(byField).map(([f, n]) => `${f} ${n}`).join(', ')}`);

    console.log('\nA sample of what would change:');
    moving.slice(0, 12).forEach(({ edge, changes }) => {
        console.log(`  ${edge._id}`);
        changes.forEach((change) => console.log(
            `      ${change.direction}.${change.field}: ${JSON.stringify(change.from)} -> ${JSON.stringify(change.to)}`
            + `${change.overridden ? '   (override kept)' : ''}`,
        ));
    });

    if (!write) {
        console.log(`\nDry run. Nothing written. Re-run with --write to regenerate ${moving.length} edges.`);
        return;
    }

    const accepted = await acceptNames(moving.map(({ edge }) => edge._id), 'regenerateNames');
    console.log(`\nRegenerated ${accepted.length} edges.`);

    const after = await loadEdgeContext();
    const left = (await listEdges())
        .filter((edge) => changesIn(edge, withNames(edge, after)).length);
    console.log(left.length ? `WARNING: ${left.length} still differ.` : 'None left differing.');
}

main()
    .catch((err) => {
        console.error(err.message);
        process.exitCode = 1;
    })
    .finally(() => closeVocabMongo());
