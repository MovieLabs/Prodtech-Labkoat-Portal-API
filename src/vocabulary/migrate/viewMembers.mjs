/**
 * Move each view's root collection onto the view, and delete the roots that held nothing else.
 *
 * ```
 * node src/vocabulary/migrate/viewMembers.mjs            # report only
 * node src/vocabulary/migrate/viewMembers.mjs --write    # apply
 * ```
 *
 * **A view is the root.** It holds its own members now, so `view.root` and the collection it named
 * both go — but only where that collection was nothing more than the view's list. A root that
 * *heads a term* is a real collection, made from a term and reusable elsewhere; it stays, and the
 * view attaches it instead of pointing at it.
 *
 * That distinction is the whole migration, and it is decided by one question: does the collection
 * have exactly one top-level member, and is that member a term?
 *
 * Placement keys are `containerId/mid`, so a row that moves from a collection onto a view changes
 * key. Every `view.arrange.hide` entry naming a moved row is rewritten, or a hidden heading
 * silently comes back.
 *
 * Dry by default.
 *
 * @module vocabulary/migrate/viewMembers
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_COLLECTIONS, VOCAB_VIEWS, vocabCollection } from '../store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';
import { prefLabel } from '../store/read.js';

const APPLY = process.argv.includes('--write');

const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({
    username: secrets.FMAM.FMAM_MONGO_USER,
    password: secrets.FMAM.FMAM_MONGO_PASSWORD,
    mongoUrl: config.VOCAB_MONGO_URL,
});

const views = vocabCollection(VOCAB_VIEWS);
const collections = vocabCollection(VOCAB_COLLECTIONS);

/** A collection that heads a term is a real collection; one that does not was only a view's list. */
const headsATerm = ((collection) => {
    const top = (collection.member ?? []).filter((member) => !member.parent);
    return top.length === 1 && Boolean(top[0].term);
});

const all = await views.find({}).toArray();
const plan = [];

for (const view of all) {
    if (!view.root) {
        plan.push({ view: view._id, action: 'already holds its members', attach: (view.member ?? []).length });
        continue;
    }
    const root = await collections.findOne({ _id: view.root });
    if (!root) {
        plan.push({ view: view._id, action: `root ${view.root} is missing — attaching nothing` , attach: 0 });
        continue;
    }
    if (headsATerm(root)) {
        plan.push({ view: view._id, action: `attach ${root._id} (heads a term, kept)`, attach: 1, keep: root._id });
    } else {
        plan.push({
            view: view._id,
            action: `take ${(root.member ?? []).length} rows from ${root._id}, then delete it`,
            attach: (root.member ?? []).length,
            drop: root._id,
        });
    }
}

console.log('Views\n');
plan.forEach((row) => console.log(`  ${row.view.padEnd(30)} ${row.action}`));

const dropping = plan.map((row) => row.drop).filter(Boolean);
console.log(`\nCollections to delete: ${dropping.length}${dropping.length ? ` — ${dropping.join(', ')}` : ''}`);

// Any hide key naming a row that is about to move.
const hideRewrites = [];
for (const view of all) {
    const hide = view.arrange?.hide ?? [];
    const row = plan.find((entry) => entry.view === view._id);
    hide.forEach((key) => {
        const container = key.slice(0, key.indexOf('/'));
        if (row?.drop && container === row.drop) hideRewrites.push({ view: view._id, key });
    });
}
console.log(`Hide keys to rewrite: ${hideRewrites.length}`);

if (!APPLY) {
    console.log('\nDry run. Pass --write to apply.');
} else {
    for (const row of plan) {
        const view = all.find((one) => one._id === row.view);
        let member;
        if (row.keep) {
            member = [{ mid: 'm1', collection: row.keep }];
        } else if (row.drop) {
            const root = await collections.findOne({ _id: row.drop });
            member = root.member ?? [];
        } else {
            member = view.member ?? [];
        }

        const arrange = view.arrange ? { ...view.arrange } : undefined;
        if (arrange?.hide && row.drop) {
            arrange.hide = arrange.hide.map((key) => (key.startsWith(`${row.drop}/`)
                ? `${view._id}/${key.slice(row.drop.length + 1)}`
                : key));
        }

        const update = { $set: { member }, $unset: { root: '' } };
        if (arrange) update.$set.arrange = arrange;
        await views.updateOne({ _id: view._id }, update);
    }

    if (dropping.length) await collections.deleteMany({ _id: { $in: dropping } });
    console.log(`\nMoved ${plan.length} views; deleted ${dropping.length} collections.`);
}

// What a collection is called, once its name comes from its head term rather than its own label.
// Reported before B2 is applied, because a difference here is the only way that change can alter a
// published name.
const drifted = [];
for (const collection of await collections.find({}).toArray()) {
    const top = (collection.member ?? []).filter((member) => !member.parent);
    if (top.length !== 1 || !top[0].term) continue;
    const term = await vocabCollection('vocab_terms').findOne({ _id: top[0].term });
    const own = prefLabel(collection);
    const head = prefLabel(term);
    if (own !== head) drifted.push(`${collection._id}: "${own}" vs term "${head}"`);
}
console.log(`\nCollections whose own name differs from their head term: ${drifted.length}`);
drifted.forEach((line) => console.log(`  ${line}`));

await closeVocabMongo();
