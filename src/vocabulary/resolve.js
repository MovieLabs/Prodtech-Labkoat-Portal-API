/**
 * Resolve a view into a flat list of placements every generator can read.
 *
 * ## What a placement is, and why the shape is flat
 *
 * A term can sit in several places — that is the point of the model — so the unit of output is not
 * a term but a **placement**: one appearance of one term, carrying the full chain of ancestors that
 * led to it. Every question a generator asks turns out to be a question about that chain:
 *
 * | Question | Answered from the path |
 * |---|---|
 * | What is this term's dotted name? | every entry, joined |
 * | What is it broader than? | the nearest entry above it that is not a scheme |
 * | Which schemes is it in? | every entry marked `scheme` |
 * | Is it a top concept? | is there no other term between it and that scheme |
 *
 * A nested tree would answer the first two and make the last two awkward. A flat list with the path
 * attached answers all four by inspection, which is why nothing downstream has to walk anything.
 *
 * ## Every path entry is a term, and one of them may be a scheme
 *
 * An arrangement belongs to a term rather than being a record of its own, so there is one kind of
 * thing in a path. What varies is the part a term plays: **a term the view attaches directly, which
 * carries an arrangement, is a `skos:ConceptScheme`** — the vocabulary those concepts belong to
 * rather than a concept that could be broader than them. So `broaderOf` steps over it, which is
 * exactly what makes the terms below it top concepts.
 *
 * That is a fact about *where the term sits in this view*, not about the term, which is why it is
 * marked on the path entry and nowhere else. The same term is a scheme in the view that heads a
 * vocabulary with it and an ordinary concept in a view that reaches it three levels down.
 *
 * ## An arrangement travels with its term
 *
 * The walk descends into a term's own `member` list wherever the term appears. That is the reuse the
 * model exists for — one Audio, arranged once, coming out in full everywhere Audio is placed — and
 * it is the one thing that makes a view publish more than the rows it names. A view that wants less
 * hides the headings it does not want.
 *
 * ## Filtering promotes rather than strands
 *
 * When a term is filtered out by status, its children attach to the nearest surviving ancestor
 * instead of disappearing with it. A published term under a proposed one is
 * content somebody wants; dropping it because of its parent loses it, and keeping it with a
 * `broader` pointing at something that is not in the output produces SKOS that does not resolve.
 * Promotion is also the correct reading: if B is broader than C and B is gone, C's broader is
 * whatever was broader than B.
 *
 * The number promoted is reported rather than assumed — see `problems`.
 *
 * ## A term can be a heading, and a heading is not published
 *
 * A term may exist to sub-categorise the ones beneath it — useful to somebody reading the thesaurus,
 * and not a value a schema should carry. `view.arrange.hide` names those placements, and they are
 * left out with their children promoted into their place, exactly as a filtered term is.
 *
 * **A term carrying an arrangement is no exception**, and it is worth saying because the two ways a
 * term can have children look nothing alike in the store: rows parented to it in this container, and
 * its own `member[]`. Both are promoted. Hiding a heading is a statement about that heading, never
 * about what it groups — to remove a branch, hide everything in it.
 *
 * **It happens during the walk, which is what makes the names come out right.** `displayName` runs
 * afterwards over whatever path survived, so a term under a hidden heading is named
 * `assetFunction.witnessCamera` rather than `assetFunction.captureGrouping.witnessCamera` without
 * anything having to shorten it.
 *
 * Hidden placements are **returned** in `suppressed` rather than discarded. An editor has to draw
 * what a view is leaving out, or there is no way to put it back. Generators read `placements` and
 * are unaffected — a flag on the one list would need all five of them to remember to skip it.
 *
 * @module vocabulary/resolve
 */

import { schemeIdFor } from './store/ids.js';
import {
    DEFAULT_LANGUAGE, getTerms, getView, hasLabelOfType, labelOfType, listViews,
} from './store/read.js';

/**
 * @typedef {object} PathEntry
 * @property {string} id - A term id. Every entry is a term; there is nothing else to be.
 * @property {boolean} [scheme] - Set where this view attaches the term directly and it carries an
 *   arrangement, which is what makes it a `skos:ConceptScheme`
 * @property {boolean} [dotFrom] - Set where this view starts its dotted names below this term
 *
 * @typedef {object} Placement
 * @property {string} termId
 * @property {string} mid - The member this came from, in `collectionId`
 * @property {string} collectionId - What declares the member: a term's arrangement, or the view
 * @property {PathEntry[]} path - Ancestors, outermost first; excludes the term itself
 * @property {string} display - The term's name as this view renders it
 */

/**
 * The key a view's `arrange` names a placement by.
 *
 * The **member row**, not the term: a term sits in many places and only one of them is the heading.
 * Both halves are already on every `Placement`, and a mid is stable within the arrangement that
 * declares it — `nextMid` continues from the highest ever used, and re-parenting only rewrites
 * `parent`.
 *
 * The one ambiguity, documented rather than solved: an arrangement reached twice in one view yields
 * two placements from one member row, so a key reaches both. Hiding the heading in both is the
 * defensible reading, and the case is rare.
 *
 * @param {string} collectionId
 * @param {string} mid
 * @returns {string}
 */
export const placementKey = ((collectionId, mid) => `${collectionId}/${mid}`);

/**
 * Load every term a view reaches, one level of nesting at a time.
 *
 * Breadth-first rather than one query per term: the vocabulary nests three or four deep, so this is
 * a handful of round trips regardless of how many terms are involved. A term is followed for its own
 * arrangement, which is the only thing that reaches further.
 *
 * @param {string[]} startIds - The terms a view attaches directly
 * @returns {Promise<Map<string, object>>}
 */
async function loadReachable(startIds) {
    const terms = new Map();
    let frontier = [...new Set(startIds)];

    while (frontier.length) {
        const loaded = await getTerms(frontier);

        const next = [];
        loaded.forEach((doc, id) => {
            terms.set(id, doc);
            (doc.member ?? []).forEach((member) => {
                if (member.term && !terms.has(member.term)) next.push(member.term);
            });
        });
        // Deduplicate: two arrangements may both reach a third term, and it need only load once.
        frontier = [...new Set(next)].filter((id) => !terms.has(id));
    }

    return terms;
}

/**
 * Walk one member list, emitting a placement per surviving term.
 *
 * @param {object} params
 * @param {string} params.containerId - What declares these rows: a term's arrangement, or the view
 * @param {Array<object>} params.members
 * @param {PathEntry[]} params.path - Ancestors, outermost first. Empty for the view's own members:
 *   a view is the root and contributes no node, so nothing above the first attached thing exists.
 * @param {object} params.ctx - Shared state: terms, keep predicate, output, problems
 * @param {Set<string>} params.chain - Term ids currently being expanded, for cycle detection
 */
function walkMembers({ containerId, members, path, ctx, chain }) {
    const here = path;

    /**
     * The path a member's children inherit, given where the member itself landed.
     *
     * Keyed by member id. A member that survives adds itself to the path; a member that is filtered
     * out passes its own inherited path straight through, which is what promotes its children.
     */
    const childPath = new Map();

    /** Members in an order where a parent is always seen before its children. */
    const ordered = [];
    const byParent = new Map();
    members.forEach((member) => {
        const key = member.parent ?? ' root';
        if (!byParent.has(key)) byParent.set(key, []);
        byParent.get(key).push(member);
    });
    const pushLevel = ((parentKey) => {
        (byParent.get(parentKey) ?? []).forEach((member) => {
            ordered.push(member);
            pushLevel(member.mid);
        });
    });
    pushLevel(' root');

    ordered.forEach((member) => {
        const inherited = member.parent ? childPath.get(member.parent) ?? here : here;

        if (!member.term) return;

        const term = ctx.terms.get(member.term);
        if (!term) {
            ctx.problems.missingTerms.push({ collection: containerId, mid: member.mid, term: member.term });
            childPath.set(member.mid, inherited);
            return;
        }

        /**
         * Walk the term's own arrangement, wherever the term appears. **This is the reuse the model
         * is for**: one Audio, arranged once, coming out in full everywhere Audio is placed.
         *
         * `to` is what the arrangement's contents attach to, and it is the only thing that differs
         * between a published placement and a hidden one — `below` for the first, the inherited path
         * for the second, which is what promotes them into the hidden heading's place.
         *
         * @param {PathEntry[]} to
         */
        const descend = ((to) => {
            if (!term.member?.length) return;
            if (chain.has(member.term)) {
                // An arrangement that reaches itself would recurse for ever. Stop, record it, and
                // carry on with the rest — one bad reference must not take the whole view down.
                ctx.problems.cycles.push({ collection: member.term, via: [...chain] });
                return;
            }
            walkMembers({
                containerId: member.term,
                members: term.member,
                path: to,
                ctx,
                chain: new Set(chain).add(member.term),
            });
        });

        // A heading this view does not publish. Asked before the status filter because it is a
        // decision about this view rather than a consequence of one, and an editor drawing what was
        // left out has to be able to say which of the two happened.
        if (ctx.hidden.has(placementKey(containerId, member.mid))) {
            childPath.set(member.mid, inherited);
            ctx.suppressed.push({
                termId: member.term, mid: member.mid, collectionId: containerId, path: inherited,
            });
            ctx.problems.hidden += 1;
            // **The heading goes, its contents stay.** A heading is hidden so that what it groups
            // reads one level up, and that has to hold however the grouping is stored: the rows
            // parented to this one are promoted by `childPath` above, and the term's own
            // arrangement by descending onto the same inherited path. Removing a branch outright is
            // hiding everything in it, which is a different gesture and still available.
            descend(inherited);
            return;
        }

        if (!ctx.keep(term)) {
            // Filtered out by status. Children inherit this member's *own* inherited path, so they
            // attach to the nearest surviving ancestor rather than vanishing.
            childPath.set(member.mid, inherited);
            ctx.problems.filtered += 1;
            if ((byParent.get(member.mid) ?? []).length) ctx.problems.promoted += 1;
            return;
        }

        ctx.placements.push({
            termId: member.term,
            mid: member.mid,
            collectionId: containerId,
            path: inherited,
        });

        // A term the view attaches directly, which carries an arrangement, is what a SKOS consumer
        // receives as a `skos:ConceptScheme`. Nothing declares that — it is where the term sits.
        const entry = { id: member.term };
        if (containerId === ctx.viewId && term.member?.length) entry.scheme = true;
        // Where this view starts counting a dotted name from. Marked on the entry rather than
        // handled here, because the name is built afterwards over whatever path survived — the same
        // reason hiding a heading shortens the names below it without anything shortening them.
        if (ctx.dotFrom.has(placementKey(containerId, member.mid))) entry.dotFrom = true;

        const below = [...inherited, entry];
        childPath.set(member.mid, below);

        descend(below);
    });
}

/**
 * The name a view gives a term at a placement.
 *
 * `dotted` joins the preferred labels of every term in the path with the term's own — which is how
 * `capture.audio.wild` is built, and the same walk `omcTable.js` does over `hasSubValue` today.
 *
 * **The consequence worth stating:** with `dotted`, the rendered name depends on the arrangement, so
 * renaming an ancestor changes every name beneath it. Where that name is a controlled value in a
 * schema, an export must be diffed against the previous one before it is handed on.
 *
 * ## Where the dots start
 *
 * A dotted name spells out the whole path, and the top of it is often the thing the reader already
 * knows: a schema holding asset-function values does not want `assetFunction.` in front of every
 * one of them. `view.arrange.dotFrom` names the placements a name should be counted from — the term
 * itself and everything above it drop out, and what is below it is dotted as before.
 *
 * The **deepest** marked ancestor wins, so marking a term inside an already-marked branch narrows
 * the name further rather than fighting with the outer one.
 *
 * ## Which of a term's names is used
 *
 * `view.labelType` decides, and it defaults to the preferred one. A view publishing OMC's controlled
 * values needs the token OMC uses — `audio`, not `Audio` — and that token is a label on the term
 * like any other, typed `omcToken`. Every segment of a dotted name is resolved the same way, so a
 * path through a term that has no token of that kind falls back to its preferred name rather than
 * breaking the chain.
 *
 * @param {Placement} placement
 * @param {Map<string, object>} terms
 * @param {string} labelStyle
 * @param {string} labelType
 * @param {string} language
 * @returns {string}
 */
function displayName(placement, terms, labelStyle, labelType, language) {
    const own = labelOfType(terms.get(placement.termId), labelType, language);
    if (labelStyle !== 'dotted') return own;
    // Everything below the deepest origin, or the whole path when this view names none.
    const from = placement.path.reduce((at, entry, index) => (entry.dotFrom ? index : at), -1);
    const ancestors = placement.path
        .slice(from + 1)
        .map((entry) => labelOfType(terms.get(entry.id), labelType, language));
    return [...ancestors, own].join('.');
}

/**
 * Resolve a view.
 *
 * @param {object} params
 * @param {string} params.viewId
 * @param {string[]} [params.status] - Overrides the view's own `publish.status`
 * @param {string} [params.language]
 * @returns {Promise<object>} The resolution every generator reads
 * @throws {Error} When the view does not exist
 */
export async function resolveView({ viewId, status = null, language = DEFAULT_LANGUAGE }) {
    const view = await getView(viewId);
    if (!view) throw new Error(`No such view: ${viewId}`);

    const attached = view.member ?? [];
    // Every term the view reaches, loaded before the walk because the walk needs a term's status to
    // decide whether to keep it, and its `member` array to decide whether to descend.
    const terms = await loadReachable(attached.map((member) => member.term).filter(Boolean));

    // The requested statuses, the view's default, or everything. An explicit empty array means
    // "no filter" rather than "nothing", because a caller asking for no filter should not get an
    // empty document.
    const effectiveStatus = status?.length ? status : (view.publish?.status ?? null);
    const keep = effectiveStatus
        ? ((term) => effectiveStatus.includes(term.status))
        : (() => true);

    const ctx = {
        terms,
        keep,
        // What the walk compares `containerId` against to know a term is attached to the view
        // itself, which is what makes it a scheme.
        viewId: view._id,
        hidden: new Set(view.arrange?.hide ?? []),
        dotFrom: new Set(view.arrange?.dotFrom ?? []),
        placements: [],
        suppressed: [],
        problems: {
            cycles: [],
            missingTerms: [],
            filtered: 0,
            promoted: 0,
            // Headings left out by `arrange.hide`. Counted apart from `filtered` because the two
            // are different facts, and deliberately not added to `promoted`: promotion is what
            // hiding is *for*, so counting it there would bury the surprises that number reports.
            hidden: 0,
            // Terms carrying no label of the kind the view asked for, whose name was therefore
            // derived or substituted. Reported rather than silent: for a view whose names *are* the
            // artifact — controlled values in a schema — a name that was worked out is a guess, and
            // it looks identical to one somebody decided.
            untyped: [],
        },
    };

    walkMembers({
        containerId: view._id, members: view.member ?? [], path: [], ctx, chain: new Set(),
    });

    const labelStyle = view.labelStyle ?? 'plain';
    const labelType = view.labelType ?? 'pref';
    const substituted = new Set();
    ctx.placements.forEach((placement) => {
        placement.display = displayName(placement, terms, labelStyle, labelType, language);
        if (labelType !== 'pref' && !hasLabelOfType(terms.get(placement.termId), labelType)) {
            substituted.add(placement.termId);
        }
    });
    ctx.problems.untyped = [...substituted];

    // Named as well, so an editor can draw them. Not checked for a substituted name: a heading is
    // not published, so the kind of label it carries cannot reach an artifact.
    ctx.suppressed.forEach((placement) => {
        placement.display = displayName(placement, terms, labelStyle, labelType, language);
    });

    return {
        view,
        language,
        status: effectiveStatus,
        terms,
        placements: ctx.placements,
        // What `arrange.hide` left out, so an editor can draw it greyed rather than absent.
        // Generators read `placements` and never see these.
        suppressed: ctx.suppressed,
        problems: ctx.problems,
        // What this view is composed of, for a target that can say so. Empty unless the view
        // gathers other published vocabularies.
        imports: await importsOf(view),
    };
}

/**
 * The vocabularies a view gathers, as ontology URIs.
 *
 * A union view is not a structure — it is a **publication**. SKOS has no scheme-of-schemes and needs
 * none: the union of two vocabularies is the union of their triples, every scheme keeping its own
 * identity and type. What is missing from that picture is a name for the whole, and the place for it
 * is the ontology, not the concept vocabulary.
 *
 * So a view that includes another view's root declares that composition with `owl:imports`. Derived
 * rather than stored, because a stored list is a second copy of the arrangement and would be wrong
 * the moment somebody dragged a collection.
 *
 * Only what a view attaches *directly* counts. A vocabulary reached three levels down was included
 * by something else, and it is that something else this view gathers.
 *
 * @param {object} view
 * @returns {Promise<string[]>}
 */
async function importsOf(view) {
    if (!view.ontology) return [];

    const direct = (view.member ?? []).map((member) => member.term).filter(Boolean);
    if (!direct.length) return [];

    const others = await listViews();
    // What another view attaches, against what this one does. A vocabulary is recognised by the
    // term at its head, which is the same thing in both.
    const byAttachment = new Map(others
        .filter((other) => other._id !== view._id && other.ontology)
        .flatMap((other) => (other.member ?? [])
            .map((member) => member.term)
            .filter(Boolean)
            .map((id) => [id, other.ontology])));

    return [...new Set(direct.map((id) => byAttachment.get(id)).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Reading a resolution. Every generator asks these rather than walking paths itself.
// ---------------------------------------------------------------------------

/**
 * The nearest term above this placement, or null.
 *
 * **Skips a scheme entry.** A term published as a `skos:ConceptScheme` is the vocabulary those
 * concepts belong to, not a concept that could be broader than them — so the terms directly under
 * it have no broader, which is what makes them top concepts.
 *
 * @param {Placement} placement
 * @returns {string|null}
 */
export function broaderOf(placement) {
    for (let i = placement.path.length - 1; i >= 0; i -= 1) {
        if (!placement.path[i].scheme) return placement.path[i].id;
    }
    return null;
}

/**
 * Every scheme enclosing this placement, at any depth, as the scheme identifier.
 *
 * @param {Placement} placement
 * @returns {string[]}
 */
export const schemesOf = ((placement) => placement.path
    .filter((entry) => entry.scheme)
    .map((entry) => schemeIdFor(entry.id)));

/**
 * The schemes this placement is a **top concept** of.
 *
 * A term is a top concept of scheme S when no other term lies between it and S.
 *
 * @param {Placement} placement
 * @returns {string[]}
 */
export function topConceptOf(placement) {
    const tops = [];
    placement.path.forEach((entry, index) => {
        if (!entry.scheme) return;
        const termBelow = placement.path.slice(index + 1).some((later) => !later.scheme);
        if (!termBelow) tops.push(schemeIdFor(entry.id));
    });
    return tops;
}

/**
 * The terms this view publishes as schemes, with the scheme identifier each takes.
 *
 * Derived from the resolution rather than asked of the store, so it says what *this* view does —
 * the same term is a scheme where a view attaches it and an ordinary concept where another view
 * reaches it three levels down.
 *
 * @param {object} resolution
 * @returns {Map<string, string>} Term id to scheme id
 */
export function schemeHeads(resolution) {
    const heads = new Map();
    resolution.placements.forEach((placement) => {
        placement.path.forEach((entry) => {
            if (entry.scheme) heads.set(entry.id, schemeIdFor(entry.id));
        });
        // A head is normally found in its children's paths, but one whose children were all filtered
        // out by status appears in none — and it is still the vocabulary the view attached. Read off
        // the placement instead: an empty path means the view attached it, and an arrangement is
        // what makes it a scheme rather than a concept.
        if (placement.path.length) return;
        const term = resolution.terms.get(placement.termId);
        if (term?.member?.length) heads.set(placement.termId, schemeIdFor(placement.termId));
    });
    return heads;
}

/**
 * Placements grouped by term, since a term may appear several times.
 *
 * @param {object} resolution
 * @returns {Map<string, Placement[]>}
 */
export function placementsByTerm(resolution) {
    const byTerm = new Map();
    resolution.placements.forEach((placement) => {
        if (!byTerm.has(placement.termId)) byTerm.set(placement.termId, []);
        byTerm.get(placement.termId).push(placement);
    });
    return byTerm;
}

/**
 * The view's tags for a term, as declared on the view.
 *
 * @param {object} resolution
 * @param {string} termId
 * @returns {string[]}
 */
export const tagsFor = ((resolution, termId) => resolution.view.tag?.[termId] ?? []);

