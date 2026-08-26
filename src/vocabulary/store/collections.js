/**
 * The vocabulary's collections in Mongo, and the indexes they need.
 *
 * **Every collection this system creates is prefixed `vocab_`.** The cluster is shared with fMam and
 * users create and name their own collections in it, so the prefix is what makes ownership legible
 * at a glance — and what lets a future collision guard be one rule rather than a list somebody has
 * to keep up to date.
 *
 * @module vocabulary/store/collections
 */

import { vocabDatabase } from './mongoConnection.js';

/**
 * Terms: meaning, and arrangement where a term has one.
 *
 * A term carrying a `member` array is what used to be a collection. There is no separate document
 * and no separate identifier — an arrangement is a property of the term it belongs to, so making a
 * term reusable no longer changes what it is called.
 */
export const VOCAB_TERMS = 'vocab_terms';

/** Views: what is specific to publishing one collection for one audience. */
export const VOCAB_VIEWS = 'vocab_views';

/** Facets: the controlled sets for label, note, example and tag types. */
export const VOCAB_FACETS = 'vocab_facets';

/**
 * Counters, for atomic id minting.
 *
 * Not in the original design, and worth saying why it earned a place. Ids used to be minted in the
 * browser by reading the highest id in a local cache and adding one — which is why the CSV import
 * has to commit one row at a time (`skosCsvImport.js`), and why a failed write left every
 * subsequent id a guess against data the database did not have. A `findOneAndUpdate` with `$inc` is
 * atomic in Mongo, so two callers can mint at once and a batch can be written in one go.
 */
export const VOCAB_COUNTERS = 'vocab_counters';

/** Every collection this subsystem owns, for setup and for teardown in tests. */
export const ALL_VOCAB_COLLECTIONS = [
    VOCAB_TERMS,
    VOCAB_VIEWS,
    VOCAB_FACETS,
    VOCAB_COUNTERS,
];

/** A handle for one of our collections. */
export const vocabCollection = ((name) => vocabDatabase().collection(name));

/**
 * Create the indexes the vocabulary relies on.
 *
 * Idempotent — `createIndex` on an index that exists is a no-op, so this runs at every boot rather
 * than being a migration step somebody has to remember.
 *
 * The two that matter for correctness rather than speed:
 *
 * - **`member.term`** is what makes "where is this used" a query instead of a scan of every term.
 *   That question is asked before every edit, to offer the change-everywhere / separate-copy choice,
 *   so it is on the interactive path. It is needed on views as well as terms, because a view holds
 *   its members the same way.
 * - **`label.value`** backs the duplicate check when a term is created or renamed. The old code
 *   walked every label in memory on each call.
 *
 * @returns {Promise<void>}
 */
export async function createVocabIndexes() {
    await Promise.all([
        vocabCollection(VOCAB_TERMS).createIndex({ 'label.value': 1 }),
        vocabCollection(VOCAB_TERMS).createIndex({ status: 1 }),
        vocabCollection(VOCAB_TERMS).createIndex({ 'member.term': 1 }),

        vocabCollection(VOCAB_VIEWS).createIndex({ 'member.term': 1 }),

        vocabCollection(VOCAB_FACETS).createIndex({ appliesTo: 1 }),
    ]);
}
