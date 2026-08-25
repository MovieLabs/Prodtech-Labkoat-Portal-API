/**
 * Move the `omc:` terms into the `vmc:` namespace.
 *
 * ```
 * node src/vocabulary/migrate/omcNamespace.mjs            # report only
 * node src/vocabulary/migrate/omcNamespace.mjs --write    # apply
 * ```
 *
 * `migrate/runOmc.js` merged OMC-JSON's controlled values into the vocabulary. Where a value matched
 * an existing SKOS term it merged; where it did not it created one, keeping the OMC identifier. So
 * the store holds two namespaces for one kind of thing, and a term in the second is indistinguishable
 * from a term in the first until it reaches an export.
 *
 * ## The local part is kept where it can be
 *
 * `omc:002A0` becomes `vmc:c-0002a0` — same number, lowercased and padded to the six digits the term
 * format uses. That is not decoration: it is the only remaining link between a term and the OMC value
 * it came from. Where the number is already taken a fresh id is minted from the counter, and those
 * are listed so the mapping is written down somewhere before it stops being derivable.
 *
 * ## An id is not a field
 *
 * Mongo's `_id` is immutable, so each term is inserted under its new id and the old document
 * deleted — and **every reference has to move with it**. A term id can appear in four places: a
 * member row on another term, a member row on a view, a key in `view.tag`, and the container half of
 * a `view.arrange` placement key. All four are rewritten, and the counts are reported rather than
 * assumed, because a reference left behind names a term that no longer exists and says so only when
 * somebody next opens the view.
 *
 * Dry by default.
 *
 * @module vocabulary/migrate/omcNamespace
 */

import { awsSecrets } from 'mlHelpers';
import fs from 'node:fs';

import config from '../../config.js';
import { VOCAB_TERMS, VOCAB_VIEWS, vocabCollection } from '../store/collections.js';
import { mintTermIds, raiseTermCounter, termIdNumber } from '../store/ids.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';
import { prefLabel } from '../store/read.js';

const APPLY = process.argv.includes('--write');
const OLD_PREFIX = 'omc:';
const NEW_PREFIX = 'vmc:c-';

const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({
    username: secrets.FMAM.FMAM_MONGO_USER,
    password: secrets.FMAM.FMAM_MONGO_PASSWORD,
    mongoUrl: config.VOCAB_MONGO_URL,
});

const termStore = vocabCollection(VOCAB_TERMS);
const viewStore = vocabCollection(VOCAB_VIEWS);

const terms = await termStore.find({}).toArray();
const views = await viewStore.find({}).toArray();

const moving = terms.filter((term) => term._id.startsWith(OLD_PREFIX));
const taken = new Set(terms.map((term) => term._id));

// The id each term would keep, where the number is free.
const plan = [];
const needMint = [];
moving.forEach((term) => {
    const number = parseInt(term._id.slice(OLD_PREFIX.length), 16);
    const kept = Number.isFinite(number)
        ? `${NEW_PREFIX}${number.toString(16).padStart(6, '0')}`
        : null;
    if (kept && !taken.has(kept)) {
        taken.add(kept);
        plan.push({ term, to: kept, minted: false });
    } else {
        needMint.push(term);
    }
});

const minted = APPLY
    ? await mintTermIds(needMint.length)
    : needMint.map((_, at) => `(mint ${at + 1})`);
needMint.forEach((term, at) => plan.push({ term, to: minted[at], minted: true }));

const rename = new Map(plan.map((row) => [row.term._id, row.to]));

// Every place a term id can appear. Counted before anything is written.
const swap = ((id) => rename.get(id) ?? id);
let memberRefs = 0;
let viewMemberRefs = 0;
let tagRefs = 0;
let arrangeRefs = 0;

const termUpdates = [];
terms.forEach((term) => {
    if (!term.member?.length) return;
    let touched = false;
    const member = term.member.map((row) => {
        if (!row.term || !rename.has(row.term)) return row;
        touched = true;
        memberRefs += 1;
        return { ...row, term: swap(row.term) };
    });
    if (touched) termUpdates.push({ _id: term._id, member });
});

const viewUpdates = [];
views.forEach((view) => {
    let touched = false;
    const member = (view.member ?? []).map((row) => {
        if (!row.term || !rename.has(row.term)) return row;
        touched = true;
        viewMemberRefs += 1;
        return { ...row, term: swap(row.term) };
    });
    const tag = {};
    Object.entries(view.tag ?? {}).forEach(([id, value]) => {
        if (rename.has(id)) {
            touched = true;
            tagRefs += 1;
        }
        tag[swap(id)] = value;
    });
    const rekey = ((list) => (list ?? []).map((key) => {
        const cut = key.indexOf('/');
        const container = key.slice(0, cut);
        if (!rename.has(container)) return key;
        touched = true;
        arrangeRefs += 1;
        return `${swap(container)}${key.slice(cut)}`;
    }));
    const arrange = view.arrange
        ? { ...view.arrange, hide: rekey(view.arrange.hide), dotFrom: rekey(view.arrange.dotFrom) }
        : undefined;
    if (touched) {
        viewUpdates.push({
            _id: view._id, member, tag, arrange,
        });
    }
});

const forked = terms.filter((term) => term.forkedFrom && rename.has(term.forkedFrom));

console.log(`Terms in the ${OLD_PREFIX} namespace: ${moving.length}`);
console.log(`  keeping their number: ${plan.filter((row) => !row.minted).length}`);
console.log(`  number already taken, so minted afresh: ${needMint.length}`);
console.log('');
console.log('References to rewrite:');
console.log(`  member rows on other terms: ${memberRefs}`);
console.log(`  member rows on views:       ${viewMemberRefs}`);
console.log(`  view tag keys:              ${tagRefs}`);
console.log(`  arrange placement keys:     ${arrangeRefs}`);
console.log(`  forkedFrom:                 ${forked.length}`);

console.log('\nThe ones whose number could not be kept — the mapping is only written down here:\n');
plan.filter((row) => row.minted).forEach((row) => {
    console.log(`  ${row.term._id}  ${JSON.stringify(prefLabel(row.term)).padEnd(28)} -> ${row.to}`);
});

const mapping = plan.map((row) => ({
    from: row.term._id, to: row.to, label: prefLabel(row.term), minted: row.minted,
}));
const out = 'C:/Users/danie/AppData/Local/Temp/claude/C--Users-danie-Dropbox-Javascript-MovieLabs-POC-Labkoat-Portal/a0f0fb56-71fc-42c9-9d8e-1dd22c73078b/scratchpad/omc-id-mapping.json';
fs.writeFileSync(out, JSON.stringify(mapping, null, 1));
console.log(`\nFull mapping written to ${out}`);

if (!APPLY) {
    console.log('\nDry run. Pass --write to apply.');
} else {
    // The terms first, under their new ids, so nothing points at a document that is not there yet.
    for (const row of plan) {
        const { _id: _old, ...content } = row.term;
        await termStore.insertOne({ ...content, _id: row.to });
    }
    for (const update of termUpdates) {
        await termStore.updateOne({ _id: update._id }, { $set: { member: update.member } });
    }
    for (const update of viewUpdates) {
        const set = { member: update.member, tag: update.tag };
        if (update.arrange) set.arrange = update.arrange;
        await viewStore.updateOne({ _id: update._id }, { $set: set });
    }
    for (const term of forked) {
        await termStore.updateOne({ _id: term._id }, { $set: { forkedFrom: swap(term.forkedFrom) } });
    }
    await termStore.deleteMany({ _id: { $in: moving.map((term) => term._id) } });

    // A kept number may sit above the counter, and a later mint must not land on it.
    const highest = Math.max(...plan.map((row) => termIdNumber(row.to) ?? 0));
    await raiseTermCounter(highest);

    console.log(`\nMoved ${plan.length} terms; counter raised to at least ${highest}.`);
    console.log(`${OLD_PREFIX} terms remaining: ${await termStore.countDocuments({ _id: { $regex: '^omc:' } })}`);
}

await closeVocabMongo();
