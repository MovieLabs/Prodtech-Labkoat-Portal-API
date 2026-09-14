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
 * external consumers key on — the whole point of the vocabulary is that `mlv:c-0000b8` means the
 * same thing tomorrow. New ids continue the same sequences.
 *
 * @module vocabulary/store/ids
 */

import { VOCAB_COUNTERS, vocabCollection } from './collections.js';

/**
 * The vocabulary's namespace: the prefix on every identifier it mints or derives, and the CURIE
 * prefix the SKOS generator declares for them. **Stored ids carry it**, so changing it is a
 * migration of the store as well as of this line.
 */
export const NAMESPACE = 'mlv';

/** Terms: `mlv:c-0000b8`. Six lowercase hex digits, as the live vocabulary has. */
const TERM_PREFIX = `${NAMESPACE}:c-`;

/** Concept schemes: `mlv:s-media-creation.0000b8`, derived at export. Never stored. */
const SCHEME_PREFIX = `${NAMESPACE}:s-`;

/** The `skos:Collection` a view publishes as: `mlv:v-media-creation`. Never stored. */
const VIEW_COLLECTION_PREFIX = `${NAMESPACE}:v-`;

/** Separates the view a scheme belongs to from the term heading it. */
const SCHEME_SEPARATOR = '.';

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
 * @returns {Promise<string[]>} Ids in the form `mlv:c-0001a3`
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

/** A view id with its `view:` prefix taken off, which is the slug it was minted as. */
const viewSlug = ((id) => (typeof id === 'string' && id.startsWith(VIEW_PREFIX)
    ? id.slice(VIEW_PREFIX.length)
    : String(id ?? '')));

/**
 * The SKOS `ConceptScheme` identifier for a term a view publishes as one.
 *
 * A term that a view attaches directly is published twice over: as the scheme, and as a concept
 * inside it. **SKOS declares Concept and ConceptScheme mutually disjoint** (SKOS Reference S9, S12),
 * so those cannot be the same URI — hence a second identifier, derived rather than stored.
 *
 * **Scoped to the view, because a scheme is an arrangement and an arrangement belongs to a view.**
 * Whether a term heads a scheme is a fact about where it sits in *this* view; two views may both
 * attach `Audio` and arrange what hangs beneath it differently. Keyed on the term alone, both would
 * publish `mlv:s-000041` and a consumer holding the two documents would read one scheme with the
 * union of two structures.
 *
 * Derived from the two ids and not from either name: a term id never changes, and a view id is a
 * slug minted once from the name it was created with, so a rename cannot move a published scheme.
 *
 * @param {string} id - A term id, `mlv:c-000041`
 * @param {string} inView - The view publishing it, `view:media-creation`
 * @returns {string} `mlv:s-media-creation.000041`
 */
export function schemeIdFor(id, inView) {
    if (typeof id !== 'string' || !id.startsWith(TERM_PREFIX)) return id;
    const hex = id.slice(TERM_PREFIX.length);
    const slug = viewSlug(inView);
    if (!slug) return `${SCHEME_PREFIX}${hex}`;
    return `${SCHEME_PREFIX}${slug}${SCHEME_SEPARATOR}${hex}`;
}

/** Where this vocabulary is published, and what its CURIE prefix expands to with a `#` added. */
export const ONTOLOGY_BASE = `https://mc.movielabs.com/${NAMESPACE}`;

/**
 * The ontology a view's artifact declares itself under — its *Published as*.
 *
 * **Derived per view, never shared.** A blank one used to fall back to the base alone, so every view
 * that had not been given one declared `owl:Ontology` at the same subject: load two such documents
 * together and they merge into one ontology carrying both labels and both sets of imports. The slug
 * makes each its own subject, and it is what the editor's form has always offered as the default.
 *
 * Asked through here by every generator, so the JSON and the SKOS cannot name one view differently.
 *
 * @param {object} view
 * @returns {string}
 */
export function ontologyFor(view) {
    const stated = String(view?.ontology ?? '').trim();
    if (stated) return stated;
    const slug = viewSlug(view?._id);
    return slug ? `${ONTOLOGY_BASE}/${slug}` : ONTOLOGY_BASE;
}

/**
 * The SKOS `Collection` identifier a view publishes as.
 *
 * Everything the view publishes is a member of it, so a consumer holding several vocabularies at
 * once can still say which terms arrived together and under whose arrangement.
 *
 * @param {string} inView - `view:media-creation`
 * @returns {string} `mlv:v-media-creation`
 */
export function viewCollectionIdFor(inView) {
    return `${VIEW_COLLECTION_PREFIX}${viewSlug(inView)}`;
}

/**
 * What a member row's `arrangement` says when the placement declines the term's own arrangement and
 * takes its children from the container it sits in instead.
 *
 * **A string rather than `null`, deliberately.** A row's `parent` is read as
 * `member.parent ? … : here`, so for that field null and absent already mean the same thing. Giving
 * `arrangement: null` the opposite meaning two keys away would be a trap: the first person to write
 * it expecting no arrangement would silently get the default one.
 *
 * Absent means the term's own `member` list, which is every row written so far.
 */
export const ARRANGEMENT_NONE = 'none';

/** Separates a term id from the fork of it a container id names. */
const FORK_SEPARATOR = '#';

/**
 * The container id for one of a term's forks.
 *
 * **The default arrangement keeps the bare term id**, and only a fork is qualified. That is what
 * makes forking cost no migration: `view.arrange.hide` and `dotFrom` are keyed `containerId/mid`,
 * so every key written before forks existed still names the same row afterwards.
 *
 * @param {string} termId - `mlv:c-000081`
 * @param {string|null} [forkId] - `f2`, or nothing for the default arrangement
 * @returns {string} `mlv:c-000081#f2`, or `mlv:c-000081`
 */
export function arrangementContainer(termId, forkId = null) {
    if (!forkId || forkId === ARRANGEMENT_NONE) return termId;
    return `${termId}${FORK_SEPARATOR}${forkId}`;
}

/**
 * Read a container id back into the term and the fork it names.
 *
 * @param {string} id
 * @returns {{termId: string, forkId: string|null}}
 */
export function readArrangementContainer(id) {
    const at = typeof id === 'string' ? id.indexOf(FORK_SEPARATOR) : -1;
    if (at < 0) return { termId: id, forkId: null };
    return { termId: id.slice(0, at), forkId: id.slice(at + FORK_SEPARATOR.length) };
}

/**
 * A fork id no fork on this term is using.
 *
 * Continues from the highest ever issued rather than filling gaps, for the reason `nextMid` does:
 * a container id is built from it, so reusing one would point an old `arrange.hide` entry at a
 * different arrangement.
 *
 * @param {Array<object>} forks - The term's `fork` array
 * @returns {string}
 */
export function nextForkId(forks = []) {
    const highest = forks.reduce((top, fork) => {
        const number = Number(String(fork.id ?? '').replace(/^f/, ''));
        return Number.isFinite(number) && number > top ? number : top;
    }, 0);
    return `f${highest + 1}`;
}
