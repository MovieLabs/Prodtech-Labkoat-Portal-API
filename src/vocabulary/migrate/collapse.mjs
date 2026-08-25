/**
 * Collapse collections onto the terms they name.
 *
 * ```
 * node src/vocabulary/migrate/collapse.mjs            # report only
 * node src/vocabulary/migrate/collapse.mjs --write    # apply
 * ```
 *
 * A collection was a document with its own minted identifier, so the same thing existed twice:
 * `vmc:s-Audio` the collection and `vmc:c-000041` the term, one meaning between them. An arrangement
 * is a property of a term rather than a record of its own, and this moves it there — the term keeps
 * its identifier and gains a `member` array.
 *
 * ## The head map is written down, not derived
 *
 * A collection and a term sharing a name is evidence, not proof. `vmc:s-Security` holds the security
 * model — Entity, Resource, Policy Service — while the term "Security" sits under Location Department
 * above Security Coordinator, Captain and Crew. Those are two different things, so that term is
 * renamed and the scheme is given a term of its own. Deriving the map from names would have merged
 * them.
 *
 * ## What the shape becomes
 *
 * One row kind: `{ mid, term, parent }`. An inclusion was `{ mid, collection }` and becomes a row
 * naming that collection's head term — whether it brings an arrangement is answered by looking at
 * the term, not by the row. Mids are preserved, so a `view.arrange.hide` key needs only its
 * container half rewritten.
 *
 * Dry by default.
 *
 * @module vocabulary/migrate/collapse
 */

import { awsSecrets } from 'mlHelpers';

import config from '../../config.js';
import { VOCAB_TERMS, VOCAB_VIEWS, vocabCollection } from '../store/collections.js';
import { mintTermIds } from '../store/ids.js';
import { closeVocabMongo, initializeVocabMongo } from '../store/mongoConnection.js';
import { prefLabel } from '../store/read.js';

/** Collection to the term that heads it. Decided by inspection; see the module note. */
const HEAD = {
    'coll:shot-size': 'vmc:c-0004ef',
    'coll:asset-structure': 'vmc:c-000035',
    'coll:asset-functions': 'vmc:c-00004D',
    'coll:lens': 'vmc:c-000081',
    'vmc:s-Audio': 'vmc:c-000041',
    'vmc:s-Asset': 'vmc:c-000034',
    'vmc:s-Camera': 'vmc:c-00005D',
    'vmc:s-Creative-Work': 'vmc:c-00001F',
    'vmc:s-Infrastructure': 'vmc:c-00008F',
    'vmc:s-Media-Creation-Context': 'vmc:c-000002',
    'vmc:s-Participant': 'vmc:c-00004F',
    'vmc:s-Task': 'vmc:c-00004E',
};

/** Collections with no term behind them. One is minted, taking the collection's own name. */
const MINT = {
    'vmc:s-Security': 'Security',
    'vmc:s-Utility': 'Utility',
    'vmc:s-Computer-Graphics': 'Computer Graphics',
    'vmc:s-Departments-and-Roles': 'Departments and Roles',
};

/** Empty, and referenced only by one dead inclusion row. */
const DROP = ['coll:testing', 'coll:asset-function'];

/** The department, freed from the name the security model needs. */
const RENAME = { 'vmc:c-0001E2': 'Security Department' };

const APPLY = process.argv.includes('--write');

const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
await initializeVocabMongo({
    username: secrets.FMAM.FMAM_MONGO_USER,
    password: secrets.FMAM.FMAM_MONGO_PASSWORD,
    mongoUrl: config.VOCAB_MONGO_URL,
});

/** Named here rather than imported: this is the last thing that will ever read it. */
const VOCAB_COLLECTIONS = 'vocab_collections';

const collectionStore = vocabCollection(VOCAB_COLLECTIONS);
const termStore = vocabCollection(VOCAB_TERMS);
const viewStore = vocabCollection(VOCAB_VIEWS);

const collections = await collectionStore.find({}).toArray();
const terms = await termStore.find({}).toArray();
const views = await viewStore.find({}).toArray();

const termById = new Map(terms.map((term) => [term._id, term]));
const nameOf = ((id) => (termById.has(id) ? prefLabel(termById.get(id)) : id));

const problems = [];

// The map has to cover every collection exactly once, and no term twice.
const covered = new Set([...Object.keys(HEAD), ...Object.keys(MINT), ...DROP]);
collections.forEach((collection) => {
    if (!covered.has(collection._id)) problems.push(`No decision for collection ${collection._id}`);
});
covered.forEach((id) => {
    if (!collections.some((collection) => collection._id === id)) problems.push(`No such collection: ${id}`);
});
const heads = Object.values(HEAD);
heads.forEach((id, at) => {
    if (heads.indexOf(id) !== at) problems.push(`Term ${id} heads two collections`);
    if (!termById.has(id)) problems.push(`No such term: ${id}`);
});
Object.keys(RENAME).forEach((id) => {
    if (!termById.has(id)) problems.push(`Cannot rename, no such term: ${id}`);
});

// Mint the head terms that do not exist. A dry run shows a placeholder rather than consuming ids.
const mintFor = new Map();
if (APPLY) {
    const ids = await mintTermIds(Object.keys(MINT).length);
    Object.keys(MINT).forEach((collectionId, at) => mintFor.set(collectionId, ids[at]));
} else {
    Object.keys(MINT).forEach((collectionId) => mintFor.set(collectionId, `(mint:${MINT[collectionId]})`));
}

const headOf = new Map(Object.entries(HEAD));
mintFor.forEach((id, collectionId) => headOf.set(collectionId, id));
const minted = new Set(mintFor.values());

// Each collection's members, rewritten onto its head term.
const dropped = new Set(DROP);
const arrangements = new Map();
const report = [];

collections.forEach((collection) => {
    if (dropped.has(collection._id)) return;
    const head = headOf.get(collection._id);
    const members = collection.member ?? [];

    // The head's own row, where it has one. Its children move up to take its place.
    const headRow = members.find((member) => member.term === head && !member.parent);
    const buried = members.find((member) => member.term === head && member.parent);
    if (buried) problems.push(`${collection._id}: head ${head} sits under ${buried.parent} rather than at the top`);

    const gone = new Set(headRow ? [headRow.mid] : []);
    const rows = [];
    members.forEach((member) => {
        if (member.mid === headRow?.mid) return;
        if (member.collection && dropped.has(member.collection)) {
            gone.add(member.mid); // Anything hanging off a dead inclusion goes with it
            return;
        }
        if (member.parent && gone.has(member.parent) && member.parent !== headRow?.mid) {
            gone.add(member.mid);
            return;
        }
        const row = { mid: member.mid };
        row.term = member.collection ? headOf.get(member.collection) : member.term;
        // A row whose parent was the head is now top level; everything else keeps its parent.
        if (member.parent && member.parent !== headRow?.mid) row.parent = member.parent;
        if (!row.term) problems.push(`${collection._id}/${member.mid}: names nothing`);
        rows.push(row);
    });

    // Every parent must still be in the array it points into.
    const mids = new Set(rows.map((row) => row.mid));
    rows.forEach((row) => {
        if (row.parent && !mids.has(row.parent)) problems.push(`${collection._id}/${row.mid}: parent ${row.parent} is gone`);
        if (row.term === head) problems.push(`${collection._id}/${row.mid}: names its own head`);
    });

    arrangements.set(head, rows);
    report.push({
        collection: collection._id,
        head,
        headName: MINT[collection._id] ?? nameOf(head),
        was: members.length,
        now: rows.length,
        headRow: headRow ? headRow.mid : 'none, the term lives elsewhere',
    });
});

const viewPlan = views.map((view) => {
    const member = (view.member ?? [])
        .filter((row) => !(row.collection && dropped.has(row.collection)))
        .map((row) => (row.collection
            ? { mid: row.mid, term: headOf.get(row.collection) }
            : row));
    const hide = (view.arrange?.hide ?? []).map((key) => {
        const cut = key.indexOf('/');
        const head = headOf.get(key.slice(0, cut));
        return head ? `${head}${key.slice(cut)}` : key;
    });
    (view.arrange?.hide ?? []).forEach((key) => {
        const container = key.slice(0, key.indexOf('/'));
        if (!headOf.has(container) && container !== view._id) {
            problems.push(`${view._id}: hide key names ${container}, which has no head`);
        }
    });
    return { view: view._id, member, hide, hadHide: view.arrange?.hide ?? [] };
});

console.log('Collections\n');
report.forEach((row) => console.log(`  ${row.collection.padEnd(30)} -> ${String(row.head).padEnd(24)} ${JSON.stringify(row.headName).padEnd(26)} ${row.was} rows, ${row.now} after; head row ${row.headRow}`));

console.log(`\nDeleting ${DROP.length}: ${DROP.join(', ')}`);
console.log(`Renaming: ${Object.entries(RENAME).map(([id, name]) => `${id} "${nameOf(id)}" -> "${name}"`).join(', ')}`);

console.log('\nViews\n');
viewPlan.forEach((row) => {
    console.log(`  ${row.view.padEnd(30)} attaches ${row.member.length}: ${row.member.map((one) => one.term).join(', ')}`);
    row.hadHide.forEach((key, at) => console.log(`      hide ${key} -> ${row.hide[at]}`));
});

// What a term gains by having its arrangement travel to its other placements. This is the reuse the
// change is for, and it is also the only thing that grows the published output.
const placedIn = new Map();
collections.forEach((collection) => (collection.member ?? []).forEach((member) => {
    if (!member.term) return;
    if (!placedIn.has(member.term)) placedIn.set(member.term, []);
    placedIn.get(member.term).push(collection._id);
}));
console.log('\nArrangements that travel — a head term placed somewhere else as well\n');
arrangements.forEach((rows, head) => {
    const elsewhere = (placedIn.get(head) ?? []).filter((id) => headOf.get(id) !== head);
    if (!elsewhere.length || !rows.length) return;
    console.log(`  ${nameOf(head).padEnd(26)} ${String(rows.length).padStart(3)} rows now also appear in ${elsewhere.join(', ')}`);
});

if (problems.length) {
    console.log(`\n${problems.length} problems:`);
    problems.forEach((line) => console.log(`  ${line}`));
} else {
    console.log('\nNo problems.');
}

if (!APPLY) {
    console.log('\nDry run. Pass --write to apply.');
} else if (problems.length) {
    console.log('\nRefusing to write with problems outstanding.');
} else {
    for (const [collectionId, name] of Object.entries(MINT)) {
        const source = collections.find((one) => one._id === collectionId);
        const id = mintFor.get(collectionId);
        await termStore.insertOne({
            _id: id,
            label: [{ value: name, language: 'en', labelType: 'pref' }],
            definition: source.definition ?? {},
            note: [],
            example: [],
            // Media Creation publishes `published` and `review`; a proposed head would take its
            // whole scheme out of the export.
            status: 'published',
            member: arrangements.get(id) ?? [],
        });
    }
    for (const [id, name] of Object.entries(RENAME)) {
        const label = (termById.get(id).label ?? []).map((entry) => (
            entry.labelType === 'pref' && entry.language === 'en' ? { ...entry, value: name } : entry));
        await termStore.updateOne({ _id: id }, { $set: { label } });
    }
    for (const [head, rows] of arrangements) {
        if (minted.has(head)) continue; // Written with the insert above
        await termStore.updateOne({ _id: head }, { $set: { member: rows } });
    }
    for (const row of viewPlan) {
        const view = views.find((one) => one._id === row.view);
        const update = { $set: { member: row.member } };
        if (view.arrange) update.$set.arrange = { ...view.arrange, hide: row.hide };
        await viewStore.updateOne({ _id: row.view }, update);
    }
    await collectionStore.drop();
    console.log(`\nWrote ${arrangements.size} arrangements and ${viewPlan.length} views; dropped ${VOCAB_COLLECTIONS}.`);
}

await closeVocabMongo();
