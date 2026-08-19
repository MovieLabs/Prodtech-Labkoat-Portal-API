/**
 * Reading terms, collections, views and facets, and the small accessors everything else asks
 * questions of a term through.
 *
 * The accessors matter more than they look. A term's names live in one faceted `label` array where
 * the preferred name is just the entry whose `labelType` is `pref` — there is no `prefLabel` field
 * to reach for. Every consumer that wants a display name has to agree on how to find it, so it is
 * written once here rather than in each generator.
 *
 * @module vocabulary/store/read
 */

import {
    VOCAB_COLLECTIONS,
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    vocabCollection,
} from './collections.js';

export const DEFAULT_LANGUAGE = 'en';

/**
 * The preferred label, as text.
 *
 * Falls back across languages rather than returning nothing: a term with a label in some language
 * but not the requested one is still better rendered by its French name than by its identifier.
 * Returns the id only when the term genuinely carries no label at all, which the migration's
 * one-pref-per-language check says should not happen.
 *
 * @param {object} term
 * @param {string} [language]
 * @returns {string}
 */
export function prefLabel(term, language = DEFAULT_LANGUAGE) {
    const labels = term?.label ?? [];
    const pref = labels.filter((entry) => entry.labelType === 'pref');
    return (pref.find((entry) => entry.language === language) ?? pref[0])?.value ?? term?._id ?? '';
}

/**
 * Labels that are not the preferred one, with their types intact.
 *
 * @param {object} term
 * @returns {Array<{value: string, language: string, labelType: string}>}
 */
export const otherLabels = ((term) => (term?.label ?? []).filter((entry) => entry.labelType !== 'pref'));

/**
 * The label of a given kind, falling back to the preferred one.
 *
 * A view may publish names of a kind other than the preferred one, which is what lets one audience
 * receive `capture.witnessCamera` where another receives `Witness Camera` — the same term, named the
 * way each consumer needs it.
 *
 * **The fallback is load-bearing.** A term with no label of the requested kind still has to be
 * named, and naming it by its identifier would put `vmc:c-0003C4` in an artifact where a word
 * belongs. So a missing label of that kind degrades to the preferred name, and the view's generator
 * reports how many terms it happened to — a count of zero is what says the view is complete.
 *
 * @param {object} term
 * @param {string} [labelType] - `'pref'` or null means the preferred label
 * @param {string} [language]
 * @returns {string}
 */
export function labelOfType(term, labelType = 'pref', language = DEFAULT_LANGUAGE) {
    if (!labelType || labelType === 'pref') return prefLabel(term, language);
    const typed = (term?.label ?? []).filter((entry) => entry.labelType === labelType);
    const found = (typed.find((entry) => entry.language === language) ?? typed[0])?.value;
    return found ?? prefLabel(term, language);
}

/**
 * Whether a term carries a label of a given kind at all.
 *
 * Separate from `labelOfType` because the fallback there makes a missing label indistinguishable
 * from a present one, and the generator has to be able to count what it substituted.
 *
 * @param {object} term
 * @param {string} labelType
 * @returns {boolean}
 */
export const hasLabelOfType = ((term, labelType) => (term?.label ?? [])
    .some((entry) => entry.labelType === labelType));

/**
 * A multilingual field as text, with the same cross-language fallback as `prefLabel`.
 *
 * @param {object} field - e.g. `term.definition`
 * @param {string} [language]
 * @returns {string}
 */
export function localised(field, language = DEFAULT_LANGUAGE) {
    if (!field || typeof field !== 'object') return '';
    return field[language] ?? Object.values(field)[0] ?? '';
}

/** One view. */
export const getView = ((id) => vocabCollection(VOCAB_VIEWS).findOne({ _id: id }));

/** Every view, for the list route. */
export const listViews = (() => vocabCollection(VOCAB_VIEWS).find({}).toArray());

/** One collection. */
export const getCollection = ((id) => vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: id }));

/** Every facet, for projection lookup and for the editor. */
export const listFacets = (() => vocabCollection(VOCAB_FACETS).find({}).toArray());

/**
 * Collections by id, in one query.
 *
 * The resolver discovers what it needs as it walks, so it cannot name every collection up front —
 * it loads a level, sees which collections that level references, and loads those. One round trip
 * per level of nesting rather than one per collection.
 *
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>}
 */
export async function getCollections(ids) {
    if (!ids.length) return new Map();
    const docs = await vocabCollection(VOCAB_COLLECTIONS).find({ _id: { $in: ids } }).toArray();
    return new Map(docs.map((doc) => [doc._id, doc]));
}

/**
 * Terms by id, in one query.
 *
 * @param {string[]} ids
 * @returns {Promise<Map<string, object>>}
 */
export async function getTerms(ids) {
    if (!ids.length) return new Map();
    const docs = await vocabCollection(VOCAB_TERMS).find({ _id: { $in: ids } }).toArray();
    return new Map(docs.map((doc) => [doc._id, doc]));
}

/**
 * Where a term is used: the collections holding a member for it, and the views publishing those.
 *
 * This is the query the change-everywhere / separate-copy prompt is built on, so it is on the
 * interactive path — hence the `member.term` index. It answers with collection and view documents
 * rather than ids because the caller is about to show them to somebody.
 *
 * @param {string} termId
 * @returns {Promise<{collections: Array<object>, views: Array<object>}>}
 */
export async function termUsage(termId) {
    const collections = await vocabCollection(VOCAB_COLLECTIONS)
        .find({ 'member.term': termId })
        .toArray();
    const ids = collections.map((collection) => collection._id);
    // A view uses a term if the term is in the view's root collection — or in anything that
    // collection reaches. Answering that exactly means resolving every view, so this reports the
    // direct case and the caller can resolve if it needs certainty.
    const views = ids.length
        ? await vocabCollection(VOCAB_VIEWS).find({ root: { $in: ids } }).toArray()
        : [];
    return { collections, views };
}

/**
 * Where a collection is used: the collections naming it as a member, and the views rooted on it.
 *
 * @param {string} collectionId
 * @returns {Promise<{collections: Array<object>, views: Array<object>}>}
 */
export async function collectionUsage(collectionId) {
    const [collections, views] = await Promise.all([
        vocabCollection(VOCAB_COLLECTIONS).find({ 'member.collection': collectionId }).toArray(),
        vocabCollection(VOCAB_VIEWS).find({ root: collectionId }).toArray(),
    ]);
    return { collections, views };
}

/**
 * Every collection, without its members.
 *
 * The membership editor needs a list to pick from, and the members are what make these documents
 * large — one collection holds 817 of them. A picker showing fourteen names has no use for the
 * arrangement inside each, so `memberCount` is computed server-side and the array is left behind.
 *
 * **`includes` is the exception, and it is not optional.** A collection that includes another can be
 * included by a third, and a client offering "drop this collection into that one" has to know which
 * choices would close a loop — a loop the resolver only discovers when someone next opens the view.
 * Answering that needs the inclusion edges, so those come back while the term members stay behind.
 * It stays small: only two collections here name any, 13 and 33.
 *
 * **`terms` is the id list only, and it is what makes "which collections place this term?"
 * answerable.** A grid listing every term has to say where each one sits, and asking that per term is
 * a thousand requests. Every id across every collection is 1,045 strings — smaller than one expanded
 * collection — and the same list is what lets a client work out the unplaced set for itself.
 *
 * @returns {Promise<Array<{_id: string, label: object[], definition: object, skosAs: string,
 *   memberCount: number, includes: string[], terms: string[]}>>}
 */
export function listCollections() {
    return vocabCollection(VOCAB_COLLECTIONS).aggregate([
        {
            $project: {
                label: 1,
                definition: 1,
                skosAs: 1,
                memberCount: { $size: { $ifNull: ['$member', []] } },
                includes: {
                    $setUnion: [{
                        $map: {
                            input: {
                                $filter: {
                                    input: { $ifNull: ['$member', []] },
                                    as: 'member',
                                    cond: { $ne: [{ $ifNull: ['$$member.collection', null] }, null] },
                                },
                            },
                            as: 'member',
                            in: '$$member.collection',
                        },
                    }],
                },
                terms: {
                    $setUnion: [{
                        $map: {
                            input: {
                                $filter: {
                                    input: { $ifNull: ['$member', []] },
                                    as: 'member',
                                    cond: { $ne: [{ $ifNull: ['$$member.term', null] }, null] },
                                },
                            },
                            as: 'member',
                            in: '$$member.term',
                        },
                    }],
                },
            },
        },
        { $sort: { _id: 1 } },
    ]).toArray();
}

/**
 * Every term.
 *
 * For an editor, not for a picker. The table has to be able to list terms that sit in **no
 * collection** — 96 do — and those appear in no view, because a view publishes a collection. Search
 * cannot reach them either without knowing their names first.
 *
 * Uncapped on purpose. The store holds hundreds and this is one request that loads it, the same way
 * the SKOS editor loads its whole dictionary at boot. If it ever grows past what a browser should
 * hold, the answer is a paged table, not a silent cap here.
 *
 * @returns {Promise<Array<object>>}
 */
export const allTerms = (() => vocabCollection(VOCAB_TERMS).find({}).toArray());

/**
 * Terms that no collection places.
 *
 * **Computed, never stored.** The migration gathered the scheme-less terms into `coll:unplaced`, and
 * that was right for a one-way import — but it is a snapshot, not a fact. Place one of those terms
 * and it stays in `coll:unplaced` for ever, and the collection slowly becomes a list of what *used*
 * to be unplaced. Asking the question instead means the answer is true when it is asked.
 *
 * `distinct` does the work in the database: one pass over the member arrays for every term id any
 * collection names, and the terms are whatever is left.
 *
 * @returns {Promise<Array<object>>}
 */
export async function unplacedTerms() {
    const placed = (await vocabCollection(VOCAB_COLLECTIONS).distinct('member.term'))
        .filter(Boolean);
    return vocabCollection(VOCAB_TERMS).find({ _id: { $nin: placed } }).toArray();
}

/**
 * Terms whose name starts with, or contains, some text.
 *
 * Prefix-first because that is what somebody typing into a picker means: typing "cap" wants
 * `Capture` before `Motion Capture`, and a plain substring search buries it. Two queries rather
 * than one aggregation with a computed rank — at this size the second round trip costs less than
 * the pipeline, and the intent stays readable.
 *
 * Case-insensitive, so the `label.value` index cannot serve the regex. That is deliberate and
 * affordable: the store holds hundreds of terms, not millions, and a picker that only matched the
 * capitalisation an editor happened to use would be worse than a collection scan.
 *
 * @param {string} text
 * @param {number} [limit]
 * @returns {Promise<Array<object>>}
 */
export async function searchTerms(text, limit = 25) {
    const trimmed = (text ?? '').trim();
    if (!trimmed) return vocabCollection(VOCAB_TERMS).find({}).limit(limit).toArray();

    // The search text is somebody's typing, and Mongo would read it as a pattern. Left unescaped, a
    // stray `(` throws rather than matching nothing.
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = await vocabCollection(VOCAB_TERMS)
        .find({ 'label.value': { $regex: `^${escaped}`, $options: 'i' } })
        .limit(limit)
        .toArray();

    if (prefix.length >= limit) return prefix;

    const found = new Set(prefix.map((term) => term._id));
    const contains = await vocabCollection(VOCAB_TERMS)
        .find({ 'label.value': { $regex: escaped, $options: 'i' }, '_id': { $nin: [...found] } })
        .limit(limit - prefix.length)
        .toArray();

    return [...prefix, ...contains];
}
