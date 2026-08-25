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
 * | What is this term's dotted name? | the term entries, joined |
 * | What is it broader than? | the nearest **term** entry above it |
 * | Which schemes is it in? | every `conceptScheme` entry, at any depth |
 * | Is it a top concept? | is there no term between it and that scheme |
 *
 * A nested tree would answer the first two and make the last two awkward. A flat list with the path
 * attached answers all four by inspection, which is why nothing downstream has to walk anything.
 *
 * ## The rule that makes nesting work
 *
 * **`broader` and `topConceptOf` are computed over terms only, skipping collection and transparent
 * members.** A grouping is not a broader concept. So a term at the head of a `skos:Collection`
 * nested inside a scheme is still a top concept *of that scheme*, and its `broader` reaches past the
 * grouping to the nearest real term — or to nothing.
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
 * This is the same idea `projections.skos: 'transparent'` expresses for a collection. It could not
 * be said of a term before, and a term is what these are: SKOS concepts, not schemes.
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

import { projectionOf } from './store/projections.js';
import {
    DEFAULT_LANGUAGE, getCollections, getTerms, getView, hasLabelOfType, labelOfType, listViews,
} from './store/read.js';

/**
 * @typedef {object} PathEntry
 * @property {'collection'|'term'} kind
 * @property {string} id
 * @property {string} [projection] - Collections only: how this one projects into SKOS
 *
 * @typedef {object} Placement
 * @property {string} termId
 * @property {string} mid - The member this came from, in `collectionId`
 * @property {string} collectionId - The collection the member is declared in
 * @property {PathEntry[]} path - Ancestors, outermost first; excludes the term itself
 * @property {string} display - The term's name as this view renders it
 */

/**
 * The key a view's `arrange` names a placement by.
 *
 * The **member row**, not the term: a term sits in many places and only one of them is the heading.
 * Both halves are already on every `Placement`, and a mid is stable within its collection —
 * `nextMid` continues from the highest ever used, and re-parenting only rewrites `parent`.
 *
 * The one ambiguity, documented rather than solved: a collection included twice in one view yields
 * two placements from one member row, so a key reaches both. Hiding the heading in both is the
 * defensible reading, and the case is rare.
 *
 * @param {string} collectionId
 * @param {string} mid
 * @returns {string}
 */
export const placementKey = ((collectionId, mid) => `${collectionId}/${mid}`);

/**
 * Load every collection a view reaches, one level of nesting at a time.
 *
 * Breadth-first rather than one query per collection: the vocabulary nests three or four deep, so
 * this is a handful of round trips regardless of how many collections are involved.
 *
 * @param {string} rootId
 * @returns {Promise<{collections: Map<string, object>, missing: string[]}>}
 */
async function loadReachable(rootId) {
    const collections = new Map();
    const missing = [];
    let frontier = [rootId];

    while (frontier.length) {
        const loaded = await getCollections(frontier);
        frontier.forEach((id) => {
            if (!loaded.has(id)) missing.push(id);
        });

        const next = [];
        loaded.forEach((doc, id) => {
            collections.set(id, doc);
            (doc.member ?? []).forEach((member) => {
                if (member.collection && !collections.has(member.collection)) {
                    next.push(member.collection);
                }
            });
        });
        // Deduplicate: two collections may both include a third, and it need only load once.
        frontier = [...new Set(next)].filter((id) => !collections.has(id));
    }

    return { collections, missing };
}

/**
 * Walk one collection, emitting a placement per surviving term.
 *
 * @param {object} params
 * @param {string} params.collectionId
 * @param {PathEntry[]} params.path - Ancestors of this collection, outermost first
 * @param {object} params.ctx - Shared state: collections, keep predicate, output, problems
 * @param {Set<string>} params.chain - Collection ids currently being expanded, for cycle detection
 */
function walkCollection({ collectionId, path, ctx, chain }) {
    // A collection that includes itself, directly or through others, would recurse forever. Stop,
    // record it, and carry on with the rest — one bad reference must not take the whole view down.
    if (chain.has(collectionId)) {
        ctx.problems.cycles.push({ collection: collectionId, via: [...chain] });
        return;
    }

    const collection = ctx.collections.get(collectionId);
    if (!collection) return; // Already recorded by loadReachable

    const nextChain = new Set(chain).add(collectionId);
    const members = collection.member ?? [];

    // The path entry this collection contributes. A `transparent` collection contributes structure
    // but no node, so it is still recorded here — generators decide whether to emit it, and the
    // scheme lookup needs to see through it either way.
    const here = [...path, {
        kind: 'collection',
        id: collectionId,
        projection: projectionOf(collection, 'skos'),
    }];

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

        if (member.collection) {
            // A nested collection, whole. What it contributes is decided where it is arranged and
            // by the view — never by the row that includes it.
            walkCollection({
                collectionId: member.collection,
                path: inherited,
                ctx,
                chain: nextChain,
            });
            // A collection member contributes no term, so its children inherit its own path.
            childPath.set(member.mid, inherited);
            return;
        }

        if (!member.term) return;

        const term = ctx.terms.get(member.term);
        if (!term) {
            ctx.problems.missingTerms.push({ collection: collectionId, mid: member.mid, term: member.term });
            childPath.set(member.mid, inherited);
            return;
        }

        // A heading this view does not publish. Asked before the status filter because it is a
        // decision about this view rather than a consequence of one, and an editor drawing what was
        // left out has to be able to say which of the two happened.
        if (ctx.hidden.has(placementKey(collectionId, member.mid))) {
            childPath.set(member.mid, inherited);
            ctx.suppressed.push({
                termId: member.term, mid: member.mid, collectionId, path: inherited,
            });
            ctx.problems.hidden += 1;
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
            collectionId,
            path: inherited,
        });
        childPath.set(member.mid, [...inherited, { kind: 'term', id: member.term }]);
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
    const ancestors = placement.path
        .filter((entry) => entry.kind === 'term')
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

    const { collections, missing } = await loadReachable(view.root);

    // Every term any reachable collection names, in one query. Loaded before the walk because the
    // walk needs a term's status to decide whether to keep it.
    const termIds = [...new Set(
        [...collections.values()].flatMap((collection) => (collection.member ?? [])
            .map((member) => member.term)
            .filter(Boolean)),
    )];
    const terms = await getTerms(termIds);

    // The requested statuses, the view's default, or everything. An explicit empty array means
    // "no filter" rather than "nothing", because a caller asking for no filter should not get an
    // empty document.
    const effectiveStatus = status?.length ? status : (view.publish?.status ?? null);
    const keep = effectiveStatus
        ? ((term) => effectiveStatus.includes(term.status))
        : (() => true);

    const ctx = {
        collections,
        terms,
        keep,
        hidden: new Set(view.arrange?.hide ?? []),
        placements: [],
        suppressed: [],
        problems: {
            cycles: [],
            missingTerms: [],
            missingCollections: missing,
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

    walkCollection({ collectionId: view.root, path: [], ctx, chain: new Set() });

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
        collections,
        terms,
        placements: ctx.placements,
        // What `arrange.hide` left out, so an editor can draw it greyed rather than absent.
        // Generators read `placements` and never see these.
        suppressed: ctx.suppressed,
        problems: ctx.problems,
        // What this view is composed of, for a target that can say so. Empty unless the view
        // gathers other published vocabularies.
        imports: await importsOf(view, collections),
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
 * Only *direct* members of the root count. A vocabulary reached three levels down was included by
 * something else, and it is that something else this view gathers.
 *
 * @param {object} view
 * @param {Map<string, object>} collections
 * @returns {Promise<string[]>}
 */
async function importsOf(view, collections) {
    if (!view.ontology) return [];

    const root = collections.get(view.root);
    const direct = (root?.member ?? []).map((member) => member.collection).filter(Boolean);
    if (!direct.length) return [];

    const others = await listViews();
    const byRoot = new Map(others
        .filter((other) => other._id !== view._id && other.ontology)
        .map((other) => [other.root, other.ontology]));

    return [...new Set(direct.map((id) => byRoot.get(id)).filter(Boolean))];
}

// ---------------------------------------------------------------------------
// Reading a resolution. Every generator asks these rather than walking paths itself.
// ---------------------------------------------------------------------------

/**
 * The nearest **term** above this placement, or null.
 *
 * Skips groupings, which is what lets a term inside a nested `skos:Collection` be broader-related to
 * a real term outside it rather than to the grouping.
 *
 * @param {Placement} placement
 * @returns {string|null}
 */
export function broaderOf(placement) {
    for (let i = placement.path.length - 1; i >= 0; i -= 1) {
        if (placement.path[i].kind === 'term') return placement.path[i].id;
    }
    return null;
}

/**
 * Every `conceptScheme` collection enclosing this placement, at any depth.
 *
 * @param {Placement} placement
 * @returns {string[]}
 */
export const schemesOf = ((placement) => placement.path
    .filter((entry) => entry.kind === 'collection' && entry.projection === 'conceptScheme')
    .map((entry) => entry.id));

/**
 * The schemes this placement is a **top concept** of.
 *
 * A term is a top concept of scheme S when no *term* lies between it and S. Groupings in between do
 * not disqualify it — a `skos:Collection` is a way of arranging concepts, not a concept that could
 * be broader than one.
 *
 * @param {Placement} placement
 * @returns {string[]}
 */
export function topConceptOf(placement) {
    const tops = [];
    placement.path.forEach((entry, index) => {
        if (entry.kind !== 'collection' || entry.projection !== 'conceptScheme') return;
        const termBelow = placement.path.slice(index + 1).some((later) => later.kind === 'term');
        if (!termBelow) tops.push(entry.id);
    });
    return tops;
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

/**
 * The view's overlay properties for a term.
 *
 * @param {object} resolution
 * @param {string} termId
 * @returns {object}
 */
export const overlayFor = ((resolution, termId) => resolution.view.overlay?.[termId] ?? {});
