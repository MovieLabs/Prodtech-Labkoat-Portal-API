/**
 * Move every stored id and IRI from the `vmc` namespace to `NAMESPACE`, once.
 *
 * ```
 * node src/vocabulary/migrateNamespace.js                            # report, write nothing
 * node src/vocabulary/migrateNamespace.js --write --backup <file>    # back up, then apply
 * node src/vocabulary/migrateNamespace.js --restore <file>           # report what a restore does
 * node src/vocabulary/migrateNamespace.js --restore <file> --write   # put the backup back
 * ```
 *
 * A term id carries its namespace — `vmc:c-000041` — and the SKOS generator writes it out as a CURIE
 * exactly as stored, so the namespace is a fact about the data as well as the code. This rewrites a
 * leading `vmc:` to `mlv:`, and a leading `https://mc.movielabs.com/vmc` to the same path under the
 * new name, wherever either occurs in `vocab_terms` and `vocab_views`. The local part is kept as it is,
 * so `vmc:c-00004D` becomes `mlv:c-00004D` and nothing else about any id changes.
 *
 * ## An id is not a field
 *
 * Mongo's `_id` is immutable, so each term is inserted under its new id and the old document deleted
 * — and every reference moves with it: rows on other terms, rows in forks, rows on views, and the
 * container half of an `arrange` key. The walk is generic, so a reference is not missed for want of
 * being listed, but **it stops on any path it was not told about**: a string holding `vmc` somewhere
 * unexpected is a thing for a person to look at, not to rewrite on a guess.
 *
 * ## Live data
 *
 * - **One transaction.** The inserts, the deletes and the view rewrites commit together or not at all.
 * - **Pinned to what was read.** Every delete and replace names the `modified` it was built from, so a
 *   write landing between the read and the commit aborts the transaction rather than being lost.
 * - **Views are stamped**, so an editor holding a stale copy is refused with a 409 rather than writing
 *   old ids back. Terms keep their stamps: a stale write to an old id is refused as "No such term"
 *   already, and the stamp says who last changed the term, which a rename should not take away.
 * - **A backup first**, of every `vocab_` collection as EJSON, and `--restore` to put one back.
 *
 * Safe to run twice: a store already moved has nothing to change. Delete this file once it has run,
 * as the earlier migrations were.
 *
 * @module vocabulary/migrateNamespace
 */

import fs from 'node:fs';

import { awsSecrets } from 'mlHelpers';
import { BSON } from 'mongodb';

import config from '../config.js';

import {
    ALL_VOCAB_COLLECTIONS, VOCAB_TERMS, VOCAB_VIEWS, vocabCollection,
} from './store/collections.js';
import { NAMESPACE } from './store/ids.js';
import { closeVocabMongo, initializeVocabMongo } from './store/mongoConnection.js';

const OLD = 'vmc';
const ACTOR = 'migrateNamespace';

/** Each rewrite applies to the start of a string only. */
const REWRITES = [
    [`${OLD}:`, `${NAMESPACE}:`],
    [`https://mc.movielabs.com/${OLD}`, `https://mc.movielabs.com/${NAMESPACE}`],
];

/**
 * Where an old id or IRI may legitimately sit, by collection. Arrays read `[]`; an object key that is
 * itself an id reads `{key}` — `view.tag` was keyed by term id before tags moved onto terms.
 */
const EXPECTED = {
    [VOCAB_TERMS]: new Set(['_id', 'member[].term', 'fork[].member[].term']),
    [VOCAB_VIEWS]: new Set([
        'member[].term', 'arrange.hide[]', 'arrange.dotFrom[]', 'ontology', 'tag.{key}',
    ]),
};

/** The collections this rewrites. Facets and the counter hold no id. */
const REWRITTEN = [VOCAB_TERMS, VOCAB_VIEWS];

async function connect() {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    return initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });
}

/** A value read back as a document, not a Date, an ObjectId or any other BSON type. */
const isPlainObject = ((value) => value !== null && typeof value === 'object'
    && Object.getPrototypeOf(value) === Object.prototype);

/** The string with an old prefix replaced, or unchanged. */
function swap(text) {
    const rule = REWRITES.find(([from]) => text.startsWith(from));
    return rule ? `${rule[1]}${text.slice(rule[0].length)}` : text;
}

/** Add one to a count kept per path. */
const tally = ((counts, path) => counts.set(path, (counts.get(path) ?? 0) + 1));

/**
 * A document with every old prefix rewritten, and where each one was.
 *
 * @param {*} value
 * @param {string} path
 * @param {{rewritten: Map<string, number>, stranded: Map<string, number>}} found - `stranded` holds
 *   strings containing the old name that no rule rewrote
 * @returns {*}
 */
function rewrite(value, path, found) {
    if (typeof value === 'string') {
        const next = swap(value);
        if (next !== value) tally(found.rewritten, path);
        else if (value.includes(OLD)) tally(found.stranded, path);
        return next;
    }
    if (Array.isArray(value)) return value.map((item) => rewrite(item, `${path}[]`, found));
    if (!isPlainObject(value)) return value;

    const out = {};
    Object.entries(value).forEach(([key, item]) => {
        const nextKey = swap(key);
        const segment = nextKey === key ? key : '{key}';
        const at = path ? `${path}.${segment}` : segment;
        if (nextKey !== key) tally(found.rewritten, at);
        else if (key.includes(OLD)) tally(found.stranded, at);
        out[nextKey] = rewrite(item, at, found);
    });
    return out;
}

/**
 * Every string and key in the named collections that still holds the old name.
 *
 * @param {string[]} names
 * @returns {Promise<Map<string, number>>} `collection:path` → count
 */
async function scan(names) {
    const left = new Map();
    for (const name of names) {
        const found = { rewritten: new Map(), stranded: new Map() };
        (await vocabCollection(name).find({}).toArray()).forEach((doc) => rewrite(doc, '', found));
        [...found.rewritten, ...found.stranded].forEach(([path, n]) => left.set(`${name}:${path}`, n));
    }
    return left;
}

/**
 * Rows naming a term the store does not hold, anywhere a row can sit.
 *
 * @returns {Promise<number>}
 */
async function danglingRows() {
    const [terms, views] = await Promise.all([
        vocabCollection(VOCAB_TERMS).find({}).toArray(),
        vocabCollection(VOCAB_VIEWS).find({}).toArray(),
    ]);
    const ids = new Set(terms.map((term) => term._id));
    const rows = [
        ...terms.flatMap((term) => [
            ...(term.member ?? []),
            ...(term.fork ?? []).flatMap((fork) => fork.member ?? []),
        ]),
        ...views.flatMap((view) => view.member ?? []),
    ];
    return rows.filter((row) => row.term && !ids.has(row.term)).length;
}

/** Print a count per path. */
function printCounts(counts) {
    [...counts].sort().forEach(([path, n]) => console.log(`    ${path.padEnd(28)} ${n}`));
}

/**
 * Work out every change, without writing.
 *
 * @returns {Promise<object>}
 */
async function plan() {
    const [terms, views] = await Promise.all([
        vocabCollection(VOCAB_TERMS).find({}).toArray(),
        vocabCollection(VOCAB_VIEWS).find({}).toArray(),
    ]);

    const found = {
        [VOCAB_TERMS]: { rewritten: new Map(), stranded: new Map() },
        [VOCAB_VIEWS]: { rewritten: new Map(), stranded: new Map() },
    };

    const moved = [];
    const termsInPlace = [];
    terms.forEach((term) => {
        const next = rewrite(term, '', found[VOCAB_TERMS]);
        if (next._id !== term._id) moved.push({ old: term, next });
        else if (JSON.stringify(next) !== JSON.stringify(term)) termsInPlace.push({ old: term, next });
    });

    const viewsChanged = [];
    views.forEach((view) => {
        const next = rewrite(view, '', found[VOCAB_VIEWS]);
        if (JSON.stringify(next) !== JSON.stringify(view)) viewsChanged.push({ old: view, next });
    });

    // Refusals, gathered rather than thrown one at a time.
    const refusals = [];
    REWRITTEN.forEach((name) => {
        found[name].rewritten.forEach((n, path) => {
            if (!EXPECTED[name].has(path)) refusals.push(`${name}: ${n} old id(s) at ${path}, which is not a known place for one`);
        });
        found[name].stranded.forEach((n, path) => {
            refusals.push(`${name}: ${n} value(s) at ${path} hold "${OLD}" but not as a prefix`);
        });
    });
    const staying = new Set(terms.map((term) => term._id));
    moved.forEach(({ old }) => staying.delete(old._id));
    moved.forEach(({ next }) => {
        if (staying.has(next._id)) refusals.push(`${next._id} already exists`);
    });

    return {
        terms, views, found, moved, termsInPlace, viewsChanged, refusals,
    };
}

/**
 * Write every `vocab_` collection to a file, refusing to overwrite one.
 *
 * @param {string} file
 */
async function backUp(file) {
    if (fs.existsSync(file)) throw new Error(`${file} already exists — a backup is never overwritten`);
    const collections = {};
    for (const name of ALL_VOCAB_COLLECTIONS) {
        collections[name] = await vocabCollection(name).find({}).toArray();
    }
    fs.writeFileSync(file, BSON.EJSON.stringify({
        takenAt: new Date().toISOString(),
        database: config.VOCAB_DB,
        collections,
    }, { relaxed: false }));
    const counts = Object.entries(collections).map(([name, docs]) => `${name} ${docs.length}`);
    console.log(`Backed up to ${file}: ${counts.join(', ')}`);
}

/**
 * Apply the plan in one transaction.
 *
 * @param {import('mongodb').MongoClient} client
 * @param {object} work - From `plan`
 */
async function apply(client, work) {
    const terms = vocabCollection(VOCAB_TERMS);
    const views = vocabCollection(VOCAB_VIEWS);
    const stamp = new Date().toISOString();

    const session = client.startSession();
    try {
        await session.withTransaction(async () => {
            if (work.moved.length) {
                await terms.insertMany(work.moved.map(({ next }) => next), { session });
                const gone = await terms.bulkWrite(
                    work.moved.map(({ old }) => ({ deleteOne: { filter: { _id: old._id, modified: old.modified } } })),
                    { session, ordered: true },
                );
                if (gone.deletedCount !== work.moved.length) {
                    throw new Error(`${work.moved.length - gone.deletedCount} term(s) changed since they were read`);
                }
            }
            for (const { old, next } of work.termsInPlace) {
                const done = await terms.replaceOne({ _id: old._id, modified: old.modified }, next, { session });
                if (!done.matchedCount) throw new Error(`${old._id} changed since it was read`);
            }
            for (const { old, next } of work.viewsChanged) {
                const done = await views.replaceOne(
                    { _id: old._id, modified: old.modified },
                    { ...next, modified: stamp, modifiedBy: ACTOR },
                    { session },
                );
                if (!done.matchedCount) throw new Error(`${old._id} changed since it was read`);
            }
        });
    } finally {
        await session.endSession();
    }
}

/**
 * Put `vocab_terms` and `vocab_views` back from a backup, in one transaction.
 *
 * Only the two collections this migration writes. Facets and the counter are left as they are: this
 * never changed them, and restoring them would discard anything done to them since.
 *
 * @param {import('mongodb').MongoClient} client
 * @param {string} file
 * @param {boolean} write
 */
async function restore(client, file, write) {
    const backup = BSON.EJSON.parse(fs.readFileSync(file, 'utf8'), { relaxed: false });
    console.log(`Backup of ${backup.database}, taken ${backup.takenAt}`);
    REWRITTEN.forEach((name) => {
        console.log(`  ${name}: ${backup.collections[name].length} documents replace what is there now`);
    });
    console.log('Anything written to those collections since the backup is lost.');
    if (!write) {
        console.log('\nNothing restored. Pass --write as well to restore.');
        return;
    }

    const session = client.startSession();
    try {
        await session.withTransaction(async () => {
            for (const name of REWRITTEN) {
                await vocabCollection(name).deleteMany({}, { session });
                await vocabCollection(name).insertMany(backup.collections[name], { session });
            }
        });
    } finally {
        await session.endSession();
    }
    console.log('\nRestored.');
}

/** The value after a flag, or null. */
function option(name) {
    const at = process.argv.indexOf(name);
    const value = at >= 0 ? process.argv[at + 1] : null;
    return value && !value.startsWith('--') ? value : null;
}

async function main() {
    if (NAMESPACE === OLD) {
        throw new Error(`NAMESPACE in store/ids.js is still "${OLD}" — change the code first`);
    }
    const write = process.argv.includes('--write');
    const restoreFrom = option('--restore');
    const backupTo = option('--backup');

    const client = await connect();

    if (restoreFrom) {
        await restore(client, restoreFrom, write);
        return;
    }

    const work = await plan();
    console.log(`Namespace: ${OLD} → ${NAMESPACE}\n`);
    console.log(`${VOCAB_TERMS}: ${work.terms.length} documents — ${work.moved.length} move to a new id, `
        + `${work.termsInPlace.length} change in place`);
    printCounts(work.found[VOCAB_TERMS].rewritten);
    console.log(`${VOCAB_VIEWS}: ${work.views.length} documents — ${work.viewsChanged.length} change`);
    printCounts(work.found[VOCAB_VIEWS].rewritten);
    console.log(`\nRows naming a term the store does not hold, before: ${await danglingRows()}`);

    if (work.refusals.length) {
        console.log('\nRefused — nothing written:');
        work.refusals.forEach((reason) => console.log(`  ${reason}`));
        process.exitCode = 1;
        return;
    }
    if (!work.moved.length && !work.termsInPlace.length && !work.viewsChanged.length) {
        console.log('\nNothing to change.');
        return;
    }
    if (!write) {
        console.log('\nDry run. Pass --write --backup <file> to apply.');
        return;
    }
    if (!backupTo) throw new Error('--write needs --backup <file>');

    await backUp(backupTo);
    await apply(client, work);
    console.log('\nCommitted.');

    const left = await scan(ALL_VOCAB_COLLECTIONS);
    console.log(`Rows naming a term the store does not hold, after: ${await danglingRows()}`);
    if (left.size) {
        console.log(`Still holding "${OLD}":`);
        printCounts(left);
        process.exitCode = 1;
    } else {
        console.log(`Nothing in any vocab_ collection holds "${OLD}".`);
    }
}

main()
    .then(async () => {
        await closeVocabMongo();
        process.exit(process.exitCode ?? 0);
    })
    .catch(async (err) => {
        console.error(err.message);
        await closeVocabMongo();
        process.exit(1);
    });
