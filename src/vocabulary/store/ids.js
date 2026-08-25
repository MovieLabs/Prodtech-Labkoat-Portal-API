/**
 * Minting identifiers for terms and views, and deriving the scheme id a published term takes.
 *
 * ## Why this moved to the server, and became atomic
 *
 * Ids used to be minted in the browser: `generateId` took every node of a type out of the local
 * cache, string-sorted them, took the last, parsed its hex suffix and added one. Three things
 * followed from that, and all three go away here.
 *
 * - A batch could not be planned up front, because every row would mint the same id. That is why
 *   the CSV import commits one row at a time and stops dead on the first failure.
 * - A **string** sort is not a numeric sort. It happens to agree while the ids are the same width
 *   and zero-padded, and stops agreeing the moment one is not.
 * - Two people editing at once mint the same id, and the write is a `MERGE`, so the second silently
 *   overwrites the first.
 *
 * `findOneAndUpdate` with `$inc` is atomic in Mongo. Two callers cannot receive the same number, a
 * batch can be minted in one round trip, and nothing depends on a cache being current.
 *
 * ## The formats are the ones already in use
 *
 * Existing ids are kept exactly as they are through the migration, because they are the identifiers
 * external consumers key on — the whole point of the vocabulary is that `vmc:c-0000b8` means the
 * same thing tomorrow. New ids continue the same sequences.
 *
 * @module vocabulary/store/ids
 */

import { VOCAB_COUNTERS, vocabCollection } from './collections.js';

/** Terms: `vmc:c-0000b8`. Six lowercase hex digits, as the live vocabulary has. */
const TERM_PREFIX = 'vmc:c-';

/** Concept schemes: `vmc:s-0000b8`, derived from a term id at export. Never stored. */
const SCHEME_PREFIX = 'vmc:s-';

/** Views: `view:media-creation`, a slug — see `viewId` for why these are not counted. */
const VIEW_PREFIX = 'view:';

/** Width of the hex suffix. Six digits allows 16.7M terms; the vocabulary holds 413. */
const HEX_WIDTH = 6;

/**
 * Take the next `count` values from a named counter, atomically.
 *
 * Increments by `count` and returns the block that reserves, rather than incrementing once per id:
 * one round trip for a whole spreadsheet, and no window in which another writer interleaves.
 *
 * @param {string} name - The counter, e.g. `'term'`
 * @param {number} [count=1] - How many to reserve
 * @returns {Promise<number>} The first value of the reserved block
 */
async function nextBlock(name, count = 1) {
    const result = await vocabCollection(VOCAB_COUNTERS).findOneAndUpdate(
        { _id: name },
        { $inc: { seq: count } },
        { upsert: true, returnDocument: 'after' },
    );
    // `seq` after the increment is the last value of the block, so the block starts count-1 back.
    return result.seq - count + 1;
}

/**
 * Mint identifiers for new terms.
 *
 * @param {number} [count=1] - How many to mint
 * @returns {Promise<string[]>} Ids in the form `vmc:c-0001a3`
 */
export async function mintTermIds(count = 1) {
    const start = await nextBlock('term', count);
    return Array.from(
        { length: count },
        (_, i) => `${TERM_PREFIX}${(start + i).toString(16).padStart(HEX_WIDTH, '0')}`,
    );
}

/** Mint exactly one term id. */
export async function mintTermId() {
    const [id] = await mintTermIds(1);
    return id;
}

/**
 * Set the term counter to at least `value`.
 *
 * The migration needs this: it preserves every existing id rather than reminting, so the counter
 * has to be advanced past the highest one it imported, or the first new term would collide with an
 * old one. `$max` rather than `$set` so running the migration twice cannot wind the counter back.
 *
 * @param {number} value - The highest numeric suffix in use
 * @returns {Promise<void>}
 */
export async function raiseTermCounter(value) {
    await vocabCollection(VOCAB_COUNTERS).updateOne(
        { _id: 'term' },
        { $max: { seq: value } },
        { upsert: true },
    );
}

/**
 * The numeric part of a term id, or null when it does not carry one.
 *
 * Parsed as **hex**, and only from the segment after the final `-`. Used by the migration to find
 * the high-water mark it must raise the counter past.
 *
 * @param {string} id
 * @returns {number|null}
 */
export function termIdNumber(id) {
    if (typeof id !== 'string' || !id.startsWith(TERM_PREFIX)) return null;
    const suffix = id.slice(id.lastIndexOf('-') + 1);
    if (!/^[0-9a-fA-F]+$/.test(suffix)) return null;
    return parseInt(suffix, 16);
}

/**
 * The identifier for a view, derived from its name.
 *
 * A slug rather than a counter: a view id is meant to be recognisable in an export and in a URL.
 *
 * **The consequence to know:** the id is derived from the name, so it does not survive a rename.
 * There is no rename path today, and adding one has to mean "keep the id, change the label" rather
 * than "mint a new id". Callers must check for an existing id before creating.
 *
 * @param {string} name
 * @returns {string} e.g. `view:omc-controlled-values`
 */
export function viewId(name) {
    const slug = String(name)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-') // Any run of non-alphanumerics becomes one hyphen
        .replace(/^-+|-+$/g, ''); // No leading or trailing hyphen
    return `${VIEW_PREFIX}${slug}`;
}

/**
 * The SKOS `ConceptScheme` identifier for a term published as one.
 *
 * A term that a view attaches directly is published twice over: as the scheme, and as a concept
 * inside it. **SKOS declares Concept and ConceptScheme mutually disjoint** (SKOS Reference S9, S12),
 * so those cannot be the same URI — hence a second identifier, derived rather than stored.
 *
 * Derived from the term id and not from its name, so a rename never moves a published scheme.
 *
 * @param {string} id - A term id, `vmc:c-000041`
 * @returns {string} `vmc:s-000041`
 */
export function schemeIdFor(id) {
    if (typeof id !== 'string' || !id.startsWith(TERM_PREFIX)) return id;
    return `${SCHEME_PREFIX}${id.slice(TERM_PREFIX.length)}`;
}
