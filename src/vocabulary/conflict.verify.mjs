/**
 * Runnable check that a write built on a stale copy is refused rather than landing.
 *
 * `node src/vocabulary/conflict.verify.mjs`
 *
 * Talks to the real database, because that is where the behaviour lives: the precondition is a Mongo
 * filter, and a mock of Mongo would be a mock of the thing under test. Everything it writes it
 * creates for itself and deletes again — the one exception is the controlled set, where it only
 * exercises the *refusal*, which by definition changes nothing.
 *
 * Throws on failure; prints a summary on success. There is no test runner in this repo.
 */

import { awsSecrets } from 'mlHelpers';

import config from '../config.js';

import { vocabCollection, VOCAB_FACETS, VOCAB_TERMS, VOCAB_VIEWS } from './store/collections.js';
import { closeVocabMongo, initializeVocabMongo } from './store/mongoConnection.js';
import { listFacets } from './store/read.js';
import {
    ConflictError,
    createTerms,
    createView,
    deleteTerm,
    deleteView,
    replaceTerm,
    saveFacet,
    saveView,
} from './store/write.js';

const ACTOR = 'conflict.verify';

let checked = 0;
const is = ((what, got, wanted) => {
    if (got !== wanted) {
        throw new Error(`${what}\n  got:    ${JSON.stringify(got)}\n  wanted: ${JSON.stringify(wanted)}`);
    }
    checked += 1;
});

/** Runs `fn`, reporting what it threw rather than letting it stop the run. */
const attempt = (async (fn) => {
    try {
        return { value: await fn() };
    } catch (err) {
        return { error: err };
    }
});

const labelled = ((value) => [{ value, language: 'en', labelType: 'pref' }]);

await initializeVocabMongo(await (async () => {
    const secrets = await awsSecrets({ region: config.AWS_REGION, arn: config.SECRET_ARN });
    return {
        username: secrets.FMAM.FMAM_MONGO_USER,
        password: secrets.FMAM.FMAM_MONGO_PASSWORD,
        mongoUrl: config.VOCAB_MONGO_URL,
    };
})());

let termId = null;
let viewId = null;

try {
    // ---- a term ----

    const { terms } = await createTerms([{
        label: labelled('Conflict Verify Term'),
        definition: { en: 'Created by conflict.verify.mjs. Safe to delete.' },
    }], ACTOR);
    termId = terms[0]._id;

    const first = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    const stale = first.modified;
    is('a new term carries a modified stamp', typeof stale, 'string');

    // The write the precondition is meant to allow.
    await replaceTerm(termId, {
        label: labelled('Conflict Verify Term'),
        definition: { en: 'First edit.' },
    }, ACTOR, stale);
    const afterFirst = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    is('a write quoting the current stamp lands', afterFirst.definition.en, 'First edit.');
    is('and moves the stamp on', afterFirst.modified !== stale, true);

    // The same write again, still quoting the stamp it read at the start — a second editor.
    const second = await attempt(() => replaceTerm(termId, {
        label: labelled('Conflict Verify Term'),
        definition: { en: 'Second edit, from a stale copy.' },
    }, ACTOR, stale));
    is('a write quoting a stamp somebody has moved past is refused',
        second.error instanceof ConflictError, true);
    is('and the refusal names who got there first',
        second.error?.message?.includes(ACTOR), true);
    is('and carries the document as it now stands',
        second.error?.current?.definition?.en, 'First edit.');

    const afterRefusal = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    is('the refused write changed nothing', afterRefusal.definition.en, 'First edit.');
    is('not even the stamp', afterRefusal.modified, afterFirst.modified);

    // No expectation at all — every client behaved this way before, and still may.
    await replaceTerm(termId, {
        label: labelled('Conflict Verify Term'),
        definition: { en: 'Unconditional.' },
    }, ACTOR);
    const afterBare = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    is('a write quoting nothing still lands', afterBare.definition.en, 'Unconditional.');

    // ---- a view, where the upsert trap lives ----

    const created = await createView({
        label: labelled('Conflict Verify View'),
        definition: { en: 'Created by conflict.verify.mjs. Safe to delete.' },
        member: [],
    }, ACTOR);
    viewId = created._id;

    const viewFirst = await vocabCollection(VOCAB_VIEWS).findOne({ _id: viewId });
    const viewStale = viewFirst.modified;

    await saveView(viewId, { ...viewFirst, nodeWidth: 300 }, ACTOR, viewStale);
    const viewRefused = await attempt(() => saveView(
        viewId, { ...viewFirst, nodeWidth: 500 }, ACTOR, viewStale,
    ));
    is('a stale view write is refused', viewRefused.error instanceof ConflictError, true);

    const held = await vocabCollection(VOCAB_VIEWS).find({ _id: viewId }).toArray();
    is('and inserts no second document — the upsert trap', held.length, 1);
    is('and leaves the landed value alone', held[0].nodeWidth, 300);

    // ---- a controlled set: the refusal only, which mutates nothing ----

    const facets = await listFacets();
    const facet = facets.find((one) => one.appliesTo === 'label');
    const facetBefore = await vocabCollection(VOCAB_FACETS).findOne({ _id: facet._id });

    const facetRefused = await attempt(() => saveFacet(
        facet._id, facet, ACTOR, true, '1999-01-01T00:00:00.000Z',
    ));
    is('a stale controlled-set write is refused', facetRefused.error instanceof ConflictError, true);

    const facetAfter = await vocabCollection(VOCAB_FACETS).findOne({ _id: facet._id });
    is('and the controlled set is untouched', facetAfter.modified, facetBefore.modified);
    is('and no second copy of it exists',
        (await vocabCollection(VOCAB_FACETS).find({ _id: facet._id }).toArray()).length, 1);
} finally {
    if (termId) await deleteTerm(termId, true, ACTOR);
    if (viewId) await deleteView(viewId);
    const strays = await vocabCollection(VOCAB_TERMS)
        .find({ 'label.value': 'Conflict Verify Term' }).toArray();
    if (strays.length) console.error(`  ! ${strays.length} stray test term(s) left behind`);
}

console.log(`conflict.verify: ${checked} checks passed`);

await closeVocabMongo();
