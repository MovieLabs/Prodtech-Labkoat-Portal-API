/**
 * Move tags from views onto terms, once.
 *
 * ```
 * node src/vocabulary/migrateTags.js            # report what would change, write nothing
 * node src/vocabulary/migrateTags.js --write    # make the change
 * ```
 *
 * Tags used to be held on the view, as `view.tag = { termId: [tag, …] }`, drawn from any number of
 * tag facets a view could narrow with `view.tagSets`. They are now held on the term, drawn from one
 * tag list, and a view names the tags it offers in `view.tags`. This makes the store say that:
 *
 * 1. **One tag list.** Every tag facet's values are gathered into `facet:tag`, keys kept, and the
 *    other tag facets are deleted.
 * 2. **Tags onto terms.** Every tag a view gave a term is added to that term's `tag`. Two views that
 *    tagged one term differently give it the union — each still shows only what it offers.
 * 3. **What each view offers.** The tags it had used, plus every value of any set it had named in
 *    `tagSets`. Then `tag` and `tagSets` are removed from the view.
 * 4. **Columns.** A `tag:<set>` column in a view's table or export profiles becomes the one `tags`
 *    column, keeping its heading.
 *
 * Safe to run twice: a store already migrated has nothing to change. Delete this file once it has
 * run, as the earlier migrations were.
 *
 * @module vocabulary/migrateTags
 */

import { awsSecrets } from 'mlHelpers';

import config from '../config.js';

import { VOCAB_FACETS, VOCAB_TERMS, VOCAB_VIEWS, vocabCollection } from './store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from './store/mongoConnection.js';
import { TAG_FACET_ID } from './tags.js';

const ACTOR = 'migrateTags';

async function connect() {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    await initializeVocabMongo({
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    });
}

/**
 * One column list with every `tag:<set>` column made the `tags` column, and only the first kept.
 *
 * @param {Array<object>|undefined} columns
 * @returns {Array<object>|null} The new list, or null when nothing changed
 */
function retagColumns(columns) {
    if (!Array.isArray(columns) || !columns.some((column) => String(column?.source).startsWith('tag:'))) {
        return null;
    }
    let seen = columns.some((column) => column?.source === 'tags');
    return columns.flatMap((column) => {
        if (!String(column?.source).startsWith('tag:')) return [column];
        if (seen) return [];
        seen = true;
        return [{ ...column, source: 'tags' }];
    });
}

async function main() {
    const write = process.argv.includes('--write');
    await connect();

    // ---- 1. one tag list ----
    const tagFacets = await vocabCollection(VOCAB_FACETS).find({ appliesTo: 'tag' }).toArray();
    const ordered = [
        ...tagFacets.filter((facet) => facet._id === TAG_FACET_ID),
        ...tagFacets.filter((facet) => facet._id !== TAG_FACET_ID),
    ];
    const byKey = new Map();
    ordered.forEach((facet) => (facet.values ?? []).forEach((value) => {
        const key = value[facet.key];
        if (key && !byKey.has(key)) byKey.set(key, { tag: key, label: { en: value.label?.en ?? key } });
    }));
    const values = [...byKey.values()];
    const known = new Set(byKey.keys());
    const retired = tagFacets.filter((facet) => facet._id !== TAG_FACET_ID).map((facet) => facet._id);
    const valuesOf = new Map(tagFacets.map((facet) => [facet._id, (facet.values ?? []).map((value) => value[facet.key])]));

    console.log(`Tag list ${TAG_FACET_ID}: ${values.map((value) => value.label.en).join(', ') || '(empty)'}`);
    if (retired.length) console.log(`  folding in and deleting: ${retired.join(', ')}`);
    values.filter((value) => /\s/.test(value.label.en)).forEach((value) => console.log(
        `  WARNING "${value.label.en}" is more than one word; saving the list will be refused until it is changed`,
    ));

    // ---- 2 & 3. views, and the terms they tagged ----
    const views = await vocabCollection(VOCAB_VIEWS).find({}).toArray();
    const addTo = new Map(); // termId -> Set of keys
    const viewWrites = [];

    views.forEach((view) => {
        const map = view.tag && typeof view.tag === 'object' ? view.tag : {};
        const used = Object.values(map).flat().filter((key) => known.has(key));
        const fromSets = (view.tagSets ?? []).flatMap((id) => valuesOf.get(id) ?? []);
        const offers = [...new Set([...(view.tags ?? []), ...used, ...fromSets])].filter((key) => known.has(key));

        Object.entries(map).forEach(([termId, keys]) => {
            const kept = (keys ?? []).filter((key) => known.has(key));
            if (!kept.length) return;
            const into = addTo.get(termId) ?? new Set();
            kept.forEach((key) => into.add(key));
            addTo.set(termId, into);
        });

        const set = {};
        const table = retagColumns(view.table?.columns);
        if (table) set['table.columns'] = table;
        ['table', 'markdown'].forEach((kind) => {
            const columns = retagColumns(view.export?.[kind]?.columns);
            if (columns) set[`export.${kind}.columns`] = columns;
        });

        const hadOld = view.tag !== undefined || view.tagSets !== undefined;
        const offersChanged = JSON.stringify(offers) !== JSON.stringify(view.tags ?? []);
        if (!hadOld && !offersChanged && !Object.keys(set).length) return;

        if (offers.length) set.tags = offers;
        console.log(`View ${view._id}: offers ${offers.join(', ') || '(none)'}`
            + `${Object.keys(map).length ? `; ${Object.keys(map).length} term(s) tagged` : ''}`
            + `${Object.keys(set).some((key) => key.includes('columns')) ? '; tag columns become `tags`' : ''}`);
        viewWrites.push({
            filter: { _id: view._id },
            update: {
                $set: { ...set, modified: new Date().toISOString(), modifiedBy: ACTOR },
                $unset: { tag: '', tagSets: '' },
            },
        });
    });

    const termIds = [...addTo.keys()];
    const found = new Set((await vocabCollection(VOCAB_TERMS)
        .find({ _id: { $in: termIds } }, { projection: { _id: 1 } }).toArray()).map((doc) => doc._id));
    const missing = termIds.filter((id) => !found.has(id));
    const termWrites = termIds.filter((id) => found.has(id)).map((id) => ({
        filter: { _id: id },
        update: {
            $addToSet: { tag: { $each: [...addTo.get(id)] } },
            $set: { modified: new Date().toISOString(), modifiedBy: ACTOR },
        },
    }));

    console.log(`\nTerms gaining tags: ${termWrites.length}`);
    termWrites.forEach((one) => console.log(`  ${one.filter._id}: ${one.update.$addToSet.tag.$each.join(', ')}`));
    if (missing.length) console.log(`Tagged by a view but no longer in the store, skipped: ${missing.join(', ')}`);

    if (!write) {
        console.log('\nDry run — nothing written. Run again with --write to make these changes.');
        return;
    }

    await vocabCollection(VOCAB_FACETS).updateOne(
        { _id: TAG_FACET_ID },
        {
            $set: { values, modified: new Date().toISOString(), modifiedBy: ACTOR },
            $setOnInsert: {
                appliesTo: 'tag',
                key: 'tag',
                label: { en: 'Tags' },
                definition: { en: 'The tags a term can be given, each a single word. A view chooses which of these it offers.' },
            },
        },
        { upsert: true },
    );
    if (retired.length) await vocabCollection(VOCAB_FACETS).deleteMany({ _id: { $in: retired } });
    if (termWrites.length) {
        await vocabCollection(VOCAB_TERMS).bulkWrite(termWrites.map((one) => ({ updateOne: one })));
    }
    if (viewWrites.length) {
        await vocabCollection(VOCAB_VIEWS).bulkWrite(viewWrites.map((one) => ({ updateOne: one })));
    }
    console.log('\nWritten.');
}

main()
    .catch((err) => {
        console.error(err);
        process.exitCode = 1;
    })
    .finally(() => closeVocabMongo());
