/**
 * Reading terms, views and facets, and the small accessors everything else asks questions of a term
 * through.
 *
 * The accessors matter more than they look. A term's names live in one faceted `label` array where
 * the preferred name is just the entry whose `labelType` is `pref` — there is no `prefLabel` field
 * to reach for. Every consumer that wants a display name has to agree on how to find it, so it is
 * written once here rather than in each generator.
 *
 * @module vocabulary/store/read
 */

import {
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    vocabCollection,
} from './collections.js';
import { ARRANGEMENT_NONE, arrangementContainer } from './ids.js';

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
 * Turn a name into the camelCase token a schema would use.
 *
 * `Set Dressing` becomes `setDressing`, `STEM` becomes `stem`, `VFX Shot` becomes `vfxShot`. A word
 * in full capitals is lowered whole rather than character by character, because `sTEM` is what the
 * naive rule produces and it is nobody's idea of a token.
 *
 * @param {string} name
 * @returns {string}
 */
export function tokenFromName(name) {
    const words = String(name ?? '').split(/[^A-Za-z0-9]+/).filter(Boolean);
    return words.map((word, at) => {
        // `VFX` -> `vfx`, not `vFX`. Any word that is already all capitals is an acronym.
        const settled = /^[A-Z0-9]+$/.test(word) && /[A-Z]/.test(word) ? word.toLowerCase() : word;
        if (at === 0) return settled.charAt(0).toLowerCase() + settled.slice(1);
        return settled.charAt(0).toUpperCase() + settled.slice(1);
    }).join('');
}

/**
 * Label types that can be worked out from the preferred name when a term carries none.
 *
 * ## Why deriving is a fallback and never the value
 *
 * **Every authored `omcToken` differs from what deriving would produce.** Not most of them — all,
 * which is the point: an authored token exists precisely because the derived one would be wrong, so
 * nobody types one that agrees.
 *
 * The differences are a rule rather than noise: the token drops the part of the name the dotted path
 * already supplies. `VFX Shot` is `vfx` because it sits under `shot`, so the value reads `shot.vfx`
 * and saying "shot" twice would be wrong; `Camera Roll` is `roll`, `Digital Asset` is `digital`.
 * That decision depends on *where the term sits*, and the same term in two arrangements would want
 * two different tokens, so nothing can derive it. One authored token even corrects a misspelling in
 * the preferred label, which deriving would faithfully repeat.
 *
 * So an authored label always wins. What deriving replaces is the **other** fallback — naming the
 * term by its preferred label, which put `Set Dressing` into a schema expecting `setDressing`. A
 * derived token is a good guess where there was previously a certain mistake, and `problems.untyped`
 * reports every one so a guess can be checked before it is published.
 *
 * @type {Object<string, function(object): string>}
 */
const DERIVABLE = {
    omcToken: ((term) => tokenFromName(prefLabel(term))),
};

/**
 * The label of a kind that can be worked out from the term's name, or null.
 *
 * `labelOfType` cannot answer this, because its last fallback is the preferred label — so a caller
 * gets a name back and cannot tell whether it is the one it asked for. That is right wherever a name
 * is *required*: every term in an artifact has to be called something. It is wrong wherever the
 * answer is a stated property rather than a name, such as a spreadsheet column headed `Acronym`,
 * which would otherwise fill with full names for every term carrying no acronym.
 *
 * @param {object} term
 * @param {string} labelType
 * @returns {string|null}
 */
export const derivedLabel = ((term, labelType) => DERIVABLE[labelType]?.(term) ?? null);

/**
 * The label of a given kind, falling back to the preferred one.
 *
 * A view may publish names of a kind other than the preferred one, which is what lets one audience
 * receive `capture.witnessCamera` where another receives `Witness Camera` — the same term, named the
 * way each consumer needs it.
 *
 * **The fallback is load-bearing, and it has two steps.** A term with no label of the requested
 * kind still has to be named. Where the kind can be worked out from the preferred name it is
 * derived — see `DERIVABLE` — which is how a schema view stops publishing `Set Dressing` where it
 * needs `setDressing`. Where it cannot, the preferred name is used as it stands, because naming the
 * term by its identifier would put `vmc:c-0003C4` in an artifact where a word belongs.
 *
 * Either way it is a substitution, and `problems.untyped` counts every one: a derived token is a
 * good guess, and a guess in a schema is worth checking before it is published.
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
    if (found) return found;
    // Deliberately here and not in `otherLabels`: this answers "what does *this view* call the
    // term", where that one lists the labels a term actually carries. Deriving there would give
    // every term in the vocabulary a `skos:altLabel` it was never given.
    return DERIVABLE[labelType]?.(term) ?? prefLabel(term, language);
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

/** One term. A term carrying a `member` array is what used to be a collection. */
export const getTerm = ((id) => vocabCollection(VOCAB_TERMS).findOne({ _id: id }));

/** Every facet, for projection lookup and for the editor. */
export const listFacets = (() => vocabCollection(VOCAB_FACETS).find({}).toArray());

/**
 * Terms by id, in one query.
 *
 * The resolver discovers what it needs as it walks, so it cannot name every term up front — it loads
 * a level, sees which arrangements that level reaches, and loads those. One round trip per level of
 * nesting rather than one per term.
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
 * Where a term is used: the terms holding a member for it, and the views doing the same.
 *
 * This is the query the change-everywhere / separate-copy prompt is built on, so it is on the
 * interactive path — hence the `member.term` index. It answers with documents rather than ids
 * because the caller is about to show them to somebody.
 *
 * **One query now answers "where is this term placed" and "where is this collection included".**
 * They were two, against two Mongo collections, and they collapsed into one the moment a collection
 * stopped being a document: including an arrangement *is* placing the term that carries it.
 *
 * A view reaching the term at depth is not reported — answering that exactly means resolving every
 * view, so this gives the direct case and the caller can resolve if it needs certainty.
 *
 * @param {string} termId
 * @returns {Promise<{collections: Array<object>, views: Array<object>}>}
 */
export async function termUsage(termId) {
    const [collections, views] = await Promise.all([
        // A term can be placed in a term's default arrangement or in any of its forks, and both are
        // "used here" to anybody asking whether this term can be deleted.
        vocabCollection(VOCAB_TERMS)
            .find({ $or: [{ 'member.term': termId }, { 'fork.member.term': termId }] })
            .toArray(),
        vocabCollection(VOCAB_VIEWS).find({ 'member.term': termId }).toArray(),
    ]);
    return { collections, views };
}

/**
 * The rows one arrangement of a term holds.
 *
 * @param {object|null} term
 * @param {string|null} [forkId] - Nothing for the term's default arrangement
 * @returns {Array<object>|null} The member array, or null when no such fork exists
 */
export function arrangementOf(term, forkId = null) {
    if (!term) return null;
    if (!forkId) return term.member ?? null;
    const fork = (term.fork ?? []).find((one) => one.id === forkId);
    return fork ? fork.member ?? [] : null;
}

/**
 * Every arrangement a term carries: the default first, then its forks.
 *
 * **The default has a name too.** It is held on the term as `arrangementName` rather than inside a
 * list, because the default is not a fork — it is the arrangement every row gets by naming nothing,
 * and giving it an entry in `fork` would make every existing collection need a migration to say so.
 * Unnamed is the ordinary case and stays legal: a term with one arrangement needs no word for it.
 */
export function arrangementsOf(term) {
    const found = [];
    if (term?.member?.length) {
        found.push({ forkId: null, name: term.arrangementName ?? null, member: term.member });
    }
    (term?.fork ?? []).forEach((fork) => found.push({
        forkId: fork.id, name: fork.name ?? null, member: fork.member ?? [],
    }));
    return found;
}

/**
 * Every arrangement, without its members — **one entry per arrangement, not per term.**
 *
 * A term carries a default arrangement and any number of named forks, and each is a separate thing
 * to place, so each is a row here. `_id` is the **container** id, which is what makes them distinct:
 * the default keeps the bare term id and a fork is qualified. `termId` says which term they are all
 * arrangements *of*, and it is the same for every one of them — that is the whole point.
 *
 * The members are what make these documents large — one holds 312 of them — and a picker showing
 * sixteen names has no use for them, so `memberCount` is computed here and the arrays are left.
 *
 * **`includes` is the exception, and it is not optional.** An arrangement that reaches another can
 * be reached by a third, and a client offering "drop this into that" has to know which choices would
 * close a loop — a loop the resolver only discovers when someone next opens the view. Answering that
 * needs the edges between arrangements, so a member naming a term that is *itself* arranged comes
 * back while the plain ones stay behind. The edge points at a **container**, because a row naming a
 * fork reaches that fork and not the term's default.
 *
 * **`terms` is the id list only, and it is what makes "which arrangements place this term?"
 * answerable.** A grid listing every term has to say where each one sits, and asking that per term
 * is a thousand requests.
 *
 * @returns {Promise<Array<object>>}
 */
export async function listCollections() {
    const carriers = await vocabCollection(VOCAB_TERMS)
        .find({ $or: [{ member: { $exists: true, $ne: [] } }, { fork: { $exists: true, $ne: [] } }] })
        .toArray();

    const rows = carriers.flatMap((term) => arrangementsOf(term).map((arrangement) => ({
        _id: arrangementContainer(term._id, arrangement.forkId),
        termId: term._id,
        forkId: arrangement.forkId,
        // What this arrangement is called, default or fork alike. Null for one nobody has named.
        arrangementName: arrangement.name,
        label: term.label,
        definition: term.definition,
        status: term.status,
        memberCount: arrangement.member.length,
        terms: [...new Set(arrangement.member.map((member) => member.term).filter(Boolean))],
        // The container each row reaches, which is a fork when the row names one.
        reaches: [...new Set(arrangement.member
            .filter((member) => member.term && member.arrangement !== ARRANGEMENT_NONE)
            .map((member) => arrangementContainer(member.term, member.arrangement ?? null)))],
    })));

    // Which of those edges land on something that is itself an arrangement. Derived against the
    // result set rather than in the query: it is a lookup into what has already been read.
    const arranged = new Set(rows.map((row) => row._id));
    const withIncludes = rows.map((row) => {
        const { reaches, ...rest } = row;
        return { ...rest, includes: reaches.filter((id) => arranged.has(id)) };
    });

    // **Which views each arrangement actually reaches**, which is the only reliable way to tell two
    // forks of one term apart: they share a label by design, and a fork's name is somebody's
    // shorthand where this is where it is being used.
    //
    // Walked rather than resolved. A resolution applies the status filter and the hidden headings,
    // and neither changes whether a view *reaches* an arrangement — so this reads the containment
    // edges already in hand and costs one more query instead of one resolution per view.
    const edges = new Map(withIncludes.map((row) => [row._id, row.includes]));
    const views = await vocabCollection(VOCAB_VIEWS).find({}).toArray();
    const inViews = new Map();
    views.forEach((view) => {
        const name = labelOfType(view, 'pref') || view._id;
        const seen = new Set();
        const queue = (view.member ?? [])
            .filter((member) => member.term && member.arrangement !== ARRANGEMENT_NONE)
            .map((member) => arrangementContainer(member.term, member.arrangement ?? null));
        while (queue.length) {
            const at = queue.pop();
            if (seen.has(at) || !edges.has(at)) continue;
            seen.add(at);
            if (!inViews.has(at)) inViews.set(at, new Set());
            inViews.get(at).add(name);
            edges.get(at).forEach((next) => queue.push(next));
        }
    });

    return withIncludes
        .map((row) => ({ ...row, inViews: [...(inViews.get(row._id) ?? [])].sort() }))
        .sort((a, b) => a._id.localeCompare(b._id));
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
 * Terms that nothing places.
 *
 * **Computed, never stored.** The migration gathered the scheme-less terms into `coll:unplaced`, and
 * that was right for a one-way import — but it is a snapshot, not a fact. Place one of those terms
 * and it stays in `coll:unplaced` for ever, and the collection slowly becomes a list of what *used*
 * to be unplaced. Asking the question instead means the answer is true when it is asked.
 *
 * **Views count as placing.** A term attached straight to a view — which is how every published
 * vocabulary begins — sits in no other term's arrangement, so looking only at terms would report
 * the heads of the vocabulary as the things nobody had filed.
 *
 * `distinct` does the work in the database: one pass over the member arrays, and the terms are
 * whatever is left.
 *
 * @returns {Promise<Array<object>>}
 */
export async function unplacedTerms() {
    const [inTerms, inForks, inViews] = await Promise.all([
        vocabCollection(VOCAB_TERMS).distinct('member.term'),
        // A term's forks hold placements too, and a term sitting only inside one is placed. Missing
        // this reports it as unplaced, which is an invitation to delete something that is in use.
        vocabCollection(VOCAB_TERMS).distinct('fork.member.term'),
        vocabCollection(VOCAB_VIEWS).distinct('member.term'),
    ]);
    const placed = [...new Set([...inTerms, ...inForks, ...inViews])].filter(Boolean);
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
