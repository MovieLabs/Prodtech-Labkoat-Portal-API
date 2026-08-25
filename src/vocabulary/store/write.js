/**
 * Creating, changing and removing terms, collections, views and facets.
 *
 * ## Two things the old write path got wrong, fixed by shape rather than by care
 *
 * **Ids are minted here, atomically.** They used to be minted in the browser from the highest id in
 * a local cache, which is why the CSV import commits one row at a time and why two editors could
 * mint the same id over a `MERGE` that then silently overwrote. `mintTermIds` reserves a block with
 * `$inc`, so a batch is one round trip and no two callers can collide.
 *
 * **A term owns its labels.** They used to be separate nodes joined by edges, and the editor minted
 * an id for a new alternate label before creating it — so `labelEquality` took it for an existing
 * one, wrote an edge to a node that never existed, and the database matched nothing and reported
 * success. Adding an alternate label from the table has therefore never worked. Here a label is a
 * field of the term, so there is no edge to dangle and no second write to get wrong.
 *
 * @module vocabulary/store/write
 */

import {
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    vocabCollection,
} from './collections.js';
import { mintTermIds, viewId as viewId_ } from './ids.js';
import { termUsage } from './read.js';
import {
    allowedFacetValues,
    checkArrangementRemoval,
    checkTermDeletion,
    validateTerm,
    validateView,
} from './validate.js';

/**
 * Raised when a write is refused. Carries the reasons so a caller can show all of them at once
 * rather than the first.
 */
export class ValidationError extends Error {
    constructor(errors) {
        super(errors.join(' '));
        this.name = 'ValidationError';
        this.errors = errors;
    }
}

/** Stamped on every write, so a record can say when it last changed and who changed it. */
const stamped = ((doc, actor) => ({
    ...doc,
    modified: new Date().toISOString(),
    modifiedBy: actor ?? 'unknown',
}));

// ---------------------------------------------------------------------------
// Terms
// ---------------------------------------------------------------------------

/**
 * Create terms.
 *
 * Takes an array and mints the whole block in one reservation, because that is what makes a
 * spreadsheet import a single pass instead of one write per row waiting on the last.
 *
 * @param {Array<object>} terms - Without `_id`; one is minted for each
 * @param {string} [actor]
 * @returns {Promise<{terms: Array<object>, warnings: string[]}>}
 * @throws {ValidationError}
 */
export async function createTerms(terms, actor) {
    if (!terms.length) return { terms: [], warnings: [] };

    const ids = await mintTermIds(terms.length);
    const allowed = await allowedFacetValues();

    const prepared = terms.map((term, index) => stamped({
        status: 'proposed', // The safe default: a new term is a proposal until somebody says otherwise
        label: [],
        note: [],
        example: [],
        definition: {},
        ...term,
        _id: ids[index],
    }, actor));

    const errors = prepared.flatMap((term, index) => validateTerm(term, allowed)
        .errors.map((message) => `Row ${index + 1}: ${message}`));
    if (errors.length) throw new ValidationError(errors);

    // A label that already names a different term. Not refused — two things can legitimately share
    // a name, and the old store's outright refusal is why terms ended up with subtly different
    // labels to get past it — but the caller is told, because usually it means a duplicate.
    const warnings = await duplicateLabelWarnings(prepared);

    await vocabCollection(VOCAB_TERMS).insertMany(prepared);
    return { terms: prepared, warnings };
}

/**
 * Labels in these terms that already name something else.
 *
 * **The message says "duplicate term" in those words.** It used to read `"X" already names
 * vmc:c-000455`, which states the collision and leaves the reader to work out what it means and
 * whether anything went wrong. Two terms sharing a name is usually a mistake and occasionally
 * deliberate — `Costume` the garment and `Costume` the department are both wanted — so this names
 * the thing, says the write went through, and leaves the judgement where it belongs.
 *
 * @param {Array<object>} terms
 * @returns {Promise<string[]>}
 */
async function duplicateLabelWarnings(terms) {
    const values = terms.flatMap((term) => (term.label ?? []).map((label) => label.value));
    if (!values.length) return [];

    const existing = await vocabCollection(VOCAB_TERMS)
        .find({ 'label.value': { $in: values } })
        .toArray();

    const ours = new Set(terms.map((term) => term._id));
    return existing
        .filter((term) => !ours.has(term._id))
        .flatMap((term) => (term.label ?? [])
            .filter((label) => values.includes(label.value))
            .map((label) => `Duplicate term: "${label.value}" is already the name of ${term._id}. `
                + 'Saved anyway, since two terms may share a name deliberately — delete this one if '
                + 'that was not what you meant.'));
}

/**
 * Replace a term.
 *
 * A full replace rather than a patch: the editor holds the whole term and sends it back entire, so a
 * partial update would be describing an edit the client never made. It is also the only way to
 * *remove* a label or a note — the old store merged on write, which is why a property could never be
 * cleared once set.
 *
 * @param {string} id
 * @param {object} term
 * @param {string} [actor]
 * @returns {Promise<{term: object, warnings: string[]}>}
 * @throws {ValidationError}
 */
export async function replaceTerm(id, term, actor) {
    const allowed = await allowedFacetValues();
    const prepared = stamped({ ...term, _id: id }, actor);

    const check = validateTerm(prepared, allowed);
    if (!check.ok) throw new ValidationError(check.errors);

    const warnings = await duplicateLabelWarnings([prepared]);

    const existing = await vocabCollection(VOCAB_TERMS).findOne({ _id: id });
    if (!existing) throw new ValidationError([`No such term: ${id}`]);

    // `migrated` is dropped on edit. It marks a document the migration owns and may replace on its
    // next run; once a person has changed it, it is theirs.
    const { migrated: _migrated, ...keep } = existing;
    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: id }, { ...keep, ...prepared });
    return { term: prepared, warnings };
}

/**
 * Delete a term, and remove every placement of it.
 *
 * The placements go too, rather than being left to dangle. A member naming a term that no longer
 * exists renders as a hole in every view that reaches it, and reports at read time far from the
 * delete that caused it.
 *
 * @param {string} id
 * @param {boolean} [force=false] - Proceed despite warnings
 * @returns {Promise<{deleted: boolean, warnings: string[], removedFrom: string[]}>}
 * @throws {ValidationError} When the term is in use and `force` is not set
 */
export async function deleteTerm(id, force = false) {
    const usage = await termUsage(id);
    const check = checkTermDeletion(usage);

    if (check.warnings.length && !force) {
        throw new ValidationError([...check.warnings, 'Pass force=true to delete it anyway.']);
    }

    // Both kinds of container hold members the same way, so both are cleared the same way.
    const fromTerms = usage.collections.map((one) => one._id);
    const fromViews = usage.views.map((one) => one._id);
    await Promise.all([
        [VOCAB_TERMS, fromTerms],
        [VOCAB_VIEWS, fromViews],
    ].map(async ([store, ids]) => {
        if (!ids.length) return;
        await vocabCollection(store).updateMany(
            { _id: { $in: ids } },
            { $pull: { member: { term: id } } },
        );
        // A member whose parent was one of the removed rows is now orphaned. Re-parenting them is
        // the same promotion the resolver does for a filtered term, and keeps the document valid
        // rather than leaving it to fail validation later.
        await Promise.all(ids.map((one) => repairParents(store, one)));
    }));

    const removedFrom = [...fromTerms, ...fromViews];

    const outcome = await vocabCollection(VOCAB_TERMS).deleteOne({ _id: id });
    return { deleted: outcome.deletedCount > 0, warnings: check.warnings, removedFrom };
}

/**
 * Re-attach members whose parent has gone.
 *
 * @param {string} store - Which Mongo collection the container lives in
 * @param {string} id - The container to repair
 * @returns {Promise<void>}
 */
async function repairParents(store, id) {
    const container = await vocabCollection(store).findOne({ _id: id });
    if (!container) return;

    const mids = new Set((container.member ?? []).map((member) => member.mid));
    const orphaned = (container.member ?? []).filter((member) => member.parent && !mids.has(member.parent));
    if (!orphaned.length) return;

    // Promoted to the top rather than guessed at: the parent is gone, so the chain above it is no
    // longer knowable from this document alone.
    const repaired = (container.member ?? []).map((member) => (
        member.parent && !mids.has(member.parent) ? { ...member, parent: null } : member
    ));
    await vocabCollection(store).updateOne({ _id: id }, { $set: { member: repaired } });
}

// ---------------------------------------------------------------------------
// Arrangements
// ---------------------------------------------------------------------------

/**
 * The document that declares a member list, and which store it lives in.
 *
 * A container is a term carrying an arrangement or a view holding its own members, and the two are
 * written the same way. **Asked rather than read off the id**: `view:` is a slug convention, not a
 * rule anything should depend on.
 *
 * @param {string} id
 * @returns {Promise<{doc: object, store: string}|null>}
 */
async function containerOf(id) {
    const view = await vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
    if (view) return { doc: view, store: VOCAB_VIEWS };
    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: id });
    if (term) return { doc: term, store: VOCAB_TERMS };
    return null;
}

/**
 * A member id no row in this list is using.
 *
 * Continues from the highest ever issued rather than filling gaps, because a placement key is
 * `containerId/mid` and reusing a mid would silently point an old `arrange.hide` entry at a
 * different row.
 *
 * @param {Array<object>} members
 * @returns {string}
 */
function nextMid(members) {
    const highest = members.reduce((top, member) => {
        const number = Number(String(member.mid ?? '').replace(/^m/, ''));
        return Number.isFinite(number) && number > top ? number : top;
    }, 0);
    return `m${highest + 1}`;
}

/**
 * Every row below one, at any depth.
 *
 * A queue rather than recursion, on data somebody may be midway through editing.
 *
 * @param {Array<object>} members
 * @param {string} mid
 * @returns {Set<string>}
 */
function descendantsOf(members, mid) {
    const found = new Set();
    let frontier = [mid];
    while (frontier.length) {
        const next = [];
        members.forEach((member) => {
            if (frontier.includes(member.parent) && !found.has(member.mid)) {
                found.add(member.mid);
                next.push(member.mid);
            }
        });
        frontier = next;
    }
    return found;
}

/**
 * Splice rows in as the last children of a parent.
 *
 * **Array order is sibling order**, so where a row sits decides where it is drawn — and a row that
 * lands anywhere other than the end of its new parent's children is drawn somewhere the reader did
 * not put it. Placed after the parent's whole subtree rather than immediately after the parent, or
 * it would arrive above its new siblings' descendants instead of below them.
 *
 * @param {Array<object>} members - Without the rows being placed
 * @param {Array<object>} rows - In order, the first being the top of the branch
 * @param {string|null} parentMid - Null for the top level, which is the end of the list
 * @returns {Array<object>}
 */
function insertUnder(members, rows, parentMid) {
    if (!parentMid) return [...members, ...rows];

    const below = descendantsOf(members, parentMid);
    let after = members.findIndex((member) => member.mid === parentMid);
    if (after < 0) return [...members, ...rows];
    members.forEach((member, index) => {
        if (below.has(member.mid) && index > after) after = index;
    });
    return [...members.slice(0, after + 1), ...rows, ...members.slice(after + 1)];
}

/**
 * Make a term's subtree its own arrangement, so it can be reused.
 *
 * ## What this is for
 *
 * A term sub-categorises the ones beneath it, and that grouping turns out to be worth having
 * somewhere else. Without this, the only reusable unit is whatever a view already attaches — so an
 * arrangement somebody built cannot be used elsewhere without being rebuilt by hand, and the rebuild
 * is a copy that drifts.
 *
 * Afterwards the subtree belongs to the term, so placing the term anywhere brings it, live.
 *
 * ## Why the published output does not move
 *
 * The term's row **stays exactly where it is** — only its children move, from the container onto the
 * term. The resolver walks a term's own arrangement wherever the term appears, so the same terms come
 * out in the same places under the same parent. Nothing about this placement changed; what changed is
 * where the rows are kept.
 *
 * ## The two things that have to be got exactly right
 *
 * - **Mids are preserved**, so the arrangement inside the subtree is untouched. But a placement key
 *   is `containerId/mid`, so every `view.arrange` entry naming a moved row is repointed at the term —
 *   otherwise a hidden heading quietly comes back.
 * - **Two documents are written and no transaction is asked for.** The term goes first: if the second
 *   write fails the rows exist in both places, which is visible and repairable, where the other order
 *   would lose them.
 *
 * @param {string} containerId - The term or view holding the subtree
 * @param {string} mid - The member row of the term to arrange
 * @param {string} [actor]
 * @returns {Promise<{term: object, source: object, moved: number, repointed: number}>}
 * @throws {ValidationError}
 */
export async function arrangeSubtree(containerId, mid, actor) {
    const container = await containerOf(containerId);
    if (!container) throw new ValidationError([`No such container: ${containerId}`]);

    const members = container.doc.member ?? [];
    const row = members.find((member) => member.mid === mid);
    if (!row) throw new ValidationError([`No member "${mid}" in ${containerId}`]);
    if (!row.term) throw new ValidationError([`Member "${mid}" names no term`]);

    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: row.term });
    if (!term) throw new ValidationError([`No such term: ${row.term}`]);
    if (term.member?.length) {
        throw new ValidationError([`"${row.term}" already carries an arrangement — it is reusable already`]);
    }

    const moved = descendantsOf(members, mid);
    if (!moved.size) throw new ValidationError(['A term with nothing under it has no arrangement to make']);

    // The moved rows in the order they were in. Those directly under the term lose their parent —
    // they are the top of its arrangement now — and the rest keep theirs, which point inside the set.
    const taken = members
        .filter((member) => moved.has(member.mid))
        .map((member) => {
            if (member.parent !== mid) return { ...member };
            const { parent: _wasTheTerm, ...top } = member;
            return top;
        });

    const arranged = stamped({ ...term, member: taken }, actor);
    const arrangedCheck = validateTerm(arranged, await allowedFacetValues());
    if (!arrangedCheck.ok) throw new ValidationError(arrangedCheck.errors);

    const remaining = members.filter((member) => !moved.has(member.mid));
    const source = stamped({ ...container.doc, member: remaining }, actor);

    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: term._id }, arranged);
    await vocabCollection(container.store).replaceOne({ _id: containerId }, source);

    const repointed = await repointArrange(containerId, term._id, moved);

    return {
        term: arranged, source, moved: taken.length, repointed,
    };
}

/**
 * Give a term's arrangement back to one container, and stop sharing it.
 *
 * The exact inverse of `arrangeSubtree`, and the reason a decision to make something reusable is not
 * a one-way door. The rows come back as local structure under the term's row in this container —
 * which means **every other placement of the term loses them**. That is what reverting is: the
 * arrangement stops being the term's and becomes this container's again.
 *
 * A mid that already names a row here is reminted, and the rows pointing at it are rewritten, because
 * two rows with one mid would make a placement key ambiguous.
 *
 * @param {string} containerId - The term or view to give the rows back to
 * @param {string} mid - The member row of the arranged term
 * @param {string} [actor]
 * @param {boolean} [force=false] - Proceed although other placements will lose the arrangement
 * @returns {Promise<{term: object, source: object, moved: number, repointed: number,
 *   warnings: string[]}>}
 * @throws {ValidationError}
 */
export async function unarrangeSubtree(containerId, mid, actor, force = false) {
    const container = await containerOf(containerId);
    if (!container) throw new ValidationError([`No such container: ${containerId}`]);

    const members = container.doc.member ?? [];
    const at = members.findIndex((member) => member.mid === mid);
    if (at < 0) throw new ValidationError([`No member "${mid}" in ${containerId}`]);

    const row = members[at];
    const term = row.term ? await vocabCollection(VOCAB_TERMS).findOne({ _id: row.term }) : null;
    if (!term) throw new ValidationError([`Member "${mid}" names no term that exists`]);
    if (!term.member?.length) throw new ValidationError([`"${row.term}" carries no arrangement`]);

    const check = checkArrangementRemoval(await termUsage(term._id), containerId);
    if (check.warnings.length && !force) {
        throw new ValidationError([...check.warnings, 'Pass force=true to revert it anyway.']);
    }

    // Remint anything that would collide. Built before the rows are rewritten so a parent and its
    // children agree on the new id.
    const taken = [];
    const rename = new Map();
    const used = members.map((member) => ({ mid: member.mid }));
    term.member.forEach((member) => {
        if (!members.some((existing) => existing.mid === member.mid)) return;
        const fresh = nextMid(used);
        rename.set(member.mid, fresh);
        used.push({ mid: fresh });
    });

    term.member.forEach((member) => {
        const back = { ...member, mid: rename.get(member.mid) ?? member.mid };
        // A row at the top of the arrangement hangs off the term's own row here; the rest keep the
        // parent they had, under its new name where it was reminted.
        back.parent = member.parent ? (rename.get(member.parent) ?? member.parent) : mid;
        taken.push(back);
    });

    // Straight after the term's row, so the subtree stays adjacent to what it belongs to.
    const remaining = [...members];
    remaining.splice(at + 1, 0, ...taken);

    const source = stamped({ ...container.doc, member: remaining }, actor);
    const { member: _wasArranged, ...plain } = term;
    const bare = stamped(plain, actor);

    await vocabCollection(container.store).replaceOne({ _id: containerId }, source);
    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: term._id }, bare);

    const repointed = await repointArrange(term._id, containerId, new Set(term.member.map((one) => one.mid)));

    return {
        term: bare, source, moved: taken.length, repointed, warnings: check.warnings,
    };
}

/**
 * Move a placement, and everything arranged beneath it, to another parent.
 *
 * ## Why this is one operation and not a detach followed by a drop
 *
 * The graph's move gesture used to remove the row, hand the reader a floating pill, and write it
 * back where they dropped it. A pill carries one thing, so anything with children under it had to be
 * refused — which is exactly the case somebody means by "move this branch". Doing both halves here
 * means the rows never exist in neither place, and a subtree is no harder than a leaf.
 *
 * Within one container this is very nearly free: children are grouped by their parent's `mid`, so
 * re-parenting the top row moves the whole branch and nothing below it is touched.
 *
 * ## The two things that have to be got right
 *
 * - **A mid is only unique inside its container.** Moving between containers can collide, so a
 *   colliding row is reminted and the rows pointing at it are rewritten together — otherwise two
 *   rows share a mid and a placement key stops naming one thing.
 * - **A placement key is `containerId/mid`**, so every `view.arrange` entry naming a moved row is
 *   repointed. Left alone, a hidden heading quietly comes back and a dotted name silently lengthens.
 *
 * @param {object} params
 * @param {string} params.fromId - The container the rows are in
 * @param {string} params.mid - The row at the top of what moves
 * @param {string} params.toId - The container they are going to
 * @param {string|null} [params.toParent] - The row they become children of, or null for the top
 * @param {string} [actor]
 * @returns {Promise<{moved: number, repointed: number, mid: string}>}
 * @throws {ValidationError}
 */
export async function movePlacement({ fromId, mid, toId, toParent = null }, actor) {
    const from = await containerOf(fromId);
    if (!from) throw new ValidationError([`No such container: ${fromId}`]);
    const to = fromId === toId ? from : await containerOf(toId);
    if (!to) throw new ValidationError([`No such container: ${toId}`]);

    const source = from.doc.member ?? [];
    const row = source.find((member) => member.mid === mid);
    if (!row) throw new ValidationError([`No member "${mid}" in ${fromId}`]);

    const moving = new Set([mid, ...descendantsOf(source, mid)]);

    // Into its own branch, which would detach it from the tree entirely.
    if (fromId === toId && toParent && moving.has(toParent)) {
        throw new ValidationError(['That would move it inside itself']);
    }

    // The common case: same container, so every mid stays exactly as it was and only the top row's
    // parent changes.
    //
    // **The rows still move in the array.** Re-parenting alone would leave the branch wherever it
    // happened to sit, which is sibling order saying one thing while the graph — which draws it as
    // the newest child — says another. `Move Up` then refuses from the top of a list the reader can
    // see it at the bottom of.
    if (fromId === toId) {
        if ((row.parent ?? null) === toParent) return { moved: 0, repointed: 0, mid };
        const taken = source.filter((member) => moving.has(member.mid)).map((member) => {
            if (member.mid !== mid) return { ...member };
            const { parent: _wasParented, ...rest } = member;
            return toParent ? { ...rest, parent: toParent } : rest;
        });
        const rest = source.filter((member) => !moving.has(member.mid));
        const updated = stamped({ ...from.doc, member: insertUnder(rest, taken, toParent) }, actor);
        await vocabCollection(from.store).replaceOne({ _id: fromId }, updated);
        return { moved: taken.length, repointed: 0, mid };
    }

    // Across containers. Remint anything that would collide, before the rows are rewritten, so a
    // parent and its children agree on the new id.
    const target = to.doc.member ?? [];
    const used = target.map((member) => ({ mid: member.mid }));
    const rename = new Map();
    source.filter((member) => moving.has(member.mid)).forEach((member) => {
        if (!target.some((existing) => existing.mid === member.mid)) return;
        const fresh = nextMid(used);
        rename.set(member.mid, fresh);
        used.push({ mid: fresh });
    });

    const taken = source.filter((member) => moving.has(member.mid)).map((member) => {
        const moved = { ...member, mid: rename.get(member.mid) ?? member.mid };
        if (member.mid === mid) {
            // The top of the branch takes its new parent; everything else keeps the one it had,
            // under its new name where it was reminted.
            if (toParent) moved.parent = toParent;
            else delete moved.parent;
        } else if (member.parent) {
            moved.parent = rename.get(member.parent) ?? member.parent;
        }
        return moved;
    });

    const remaining = source.filter((member) => !moving.has(member.mid));
    const nextSource = stamped({ ...from.doc, member: remaining }, actor);
    const nextTarget = stamped({ ...to.doc, member: insertUnder(target, taken, toParent) }, actor);

    // The source first: if the second write fails the rows are gone rather than duplicated, and a
    // duplicate placement is the harder of the two to find afterwards.
    await vocabCollection(from.store).replaceOne({ _id: fromId }, nextSource);
    await vocabCollection(to.store).replaceOne({ _id: toId }, nextTarget);

    const repointed = await repointArrange(fromId, toId, moving, rename);

    return { moved: taken.length, repointed, mid: rename.get(mid) ?? mid };
}

/**
 * Move every `view.arrange` entry naming one of the moved rows onto its new container.
 *
 * A placement key is `containerId/mid`, so a subtree changing hands invalidates every key naming it.
 * Left alone, a hidden heading silently reappears — a change to a published artifact that nobody
 * asked for.
 *
 * @param {string} fromId
 * @param {string} toId
 * @param {Set<string>} mids - The rows that moved
 * @param {Map<string, string>} [rename] - New mids, where moving forced a row to be reminted
 * @returns {Promise<number>} How many views were rewritten
 */
async function repointArrange(fromId, toId, mids, rename = new Map()) {
    const swap = ((key) => {
        if (typeof key !== 'string') return key;
        const cut = key.indexOf('/');
        if (cut < 0) return key;
        const container = key.slice(0, cut);
        const mid = key.slice(cut + 1);
        if (container !== fromId || !mids.has(mid)) return key;
        return `${toId}/${rename.get(mid) ?? mid}`;
    });

    const views = await vocabCollection(VOCAB_VIEWS).find({ arrange: { $exists: true } }).toArray();
    const rewritten = await Promise.all(views.map(async (view) => {
        const arrange = { ...view.arrange };
        // Every list that names a placement, or a subtree changing hands silently loses whichever
        // one was not thought of here.
        if (view.arrange.hide) arrange.hide = view.arrange.hide.map(swap);
        if (view.arrange.dotFrom) arrange.dotFrom = view.arrange.dotFrom.map(swap);
        if (JSON.stringify(arrange) === JSON.stringify(view.arrange)) return 0;
        await vocabCollection(VOCAB_VIEWS).updateOne({ _id: view._id }, { $set: { arrange } });
        return 1;
    }));

    return rewritten.reduce((total, one) => total + one, 0);
}

// ---------------------------------------------------------------------------
// Views and facets
// ---------------------------------------------------------------------------

/**
 * Create or replace a view.
 *
 * @param {string} id
 * @param {object} view
 * @param {string} [actor]
 * @returns {Promise<object>}
 * @throws {ValidationError}
 */
/**
 * Create a view, minting its identifier from its name.
 *
 * The same rule collections follow, and for the same reason: the id reaches an export and a URL, so
 * it is derived once and then fixed. **A rename changes the label and keeps the id** — the ontology
 * URI, and anything pointing at the view, must not move because somebody improved its title.
 *
 * Everything else is `saveView`'s job, including the check that the root collection exists.
 *
 * @param {object} view - Without `_id`
 * @param {string} [actor]
 * @returns {Promise<object>}
 * @throws {ValidationError}
 */
export async function createView(view, actor) {
    const name = (view.label ?? []).find((label) => label.labelType === 'pref')?.value;
    if (!name) throw new ValidationError(['A view must have a preferred label']);

    const id = viewId_(name);
    const clash = await vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
    if (clash) throw new ValidationError([`A view named "${name}" already exists (${id})`]);

    return saveView(id, view, actor);
}

export async function saveView(id, view, actor) {
    const allowed = await allowedFacetValues();
    const prepared = stamped({ labelStyle: 'plain', member: [], ...view, _id: id }, actor);

    const check = validateView(prepared, allowed);
    if (!check.ok) throw new ValidationError(check.errors);

    // Everything the view attaches has to exist: a view naming a term nobody has renders with a
    // hole, and says so only when somebody opens it.
    const ids = (prepared.member ?? []).map((member) => member.term).filter(Boolean);
    if (ids.length) {
        const found = await vocabCollection(VOCAB_TERMS)
            .find({ _id: { $in: ids } }, { projection: { _id: 1 } })
            .toArray();
        const known = new Set(found.map((doc) => doc._id));
        const missing = [...new Set(ids.filter((one) => !known.has(one)))];
        if (missing.length) throw new ValidationError([`These terms do not exist: ${missing.join(', ')}`]);
    }

    await vocabCollection(VOCAB_VIEWS).replaceOne({ _id: id }, prepared, { upsert: true });
    return prepared;
}

/**
 * Delete a view.
 *
 * **Nothing else goes with it.** A view names a collection and says how to publish it; the
 * collection, everything it reaches and every term in it are untouched, and another view attaching
 * the same collection carries on unaffected. So there is nothing to refuse and nothing to warn
 * about — which is worth stating, because deleting a *collection* is a different matter and these
 * two sit next to each other in the interface.
 *
 * What is lost is the record itself: the ontology URI, the label style, the statuses it publishes
 * and its tag overlay. A seeded view comes back on the next seed run, without those edits.
 *
 * @param {string} id
 * @returns {Promise<{deleted: boolean, root: string|null}>}
 */
export async function deleteView(id) {
    const view = await vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
    if (!view) return { deleted: false, root: null };
    const outcome = await vocabCollection(VOCAB_VIEWS).deleteOne({ _id: id });
    return { deleted: outcome.deletedCount > 0, attached: (view.member ?? []).length };
}

/**
 * Create or replace a facet — the controlled set behind a kind of label, note, example or tag.
 *
 * **Removing a value does not remove it from the terms already using it.** Those terms keep it, the
 * SKOS generator reports it as an unknown type rather than dropping it silently, and the next edit
 * to such a term is refused until it is corrected. That is deliberate: rewriting hundreds of terms
 * as a side effect of an edit to a list is not something a list editor should be able to do by
 * accident.
 *
 * @param {string} id
 * @param {object} facet
 * @param {string} [actor]
 * @returns {Promise<{facet: object, warnings: string[]}>}
 * @throws {ValidationError}
 */
export async function saveFacet(id, facet, actor) {
    if (!facet?.appliesTo || !facet?.key) {
        throw new ValidationError(['A facet must say what it applies to and which key its values carry']);
    }

    const prepared = stamped({ ...facet, _id: id }, actor);
    const warnings = [];

    const previous = await vocabCollection(VOCAB_FACETS).findOne({ _id: id });
    if (previous) {
        const before = new Set((previous.values ?? []).map((value) => value[previous.key]));
        const after = new Set((prepared.values ?? []).map((value) => value[prepared.key]));
        const removed = [...before].filter((value) => !after.has(value));

        if (removed.length) {
            const inUse = await vocabCollection(VOCAB_TERMS)
                .countDocuments({ [`${prepared.appliesTo}.${prepared.key}`]: { $in: removed } });
            if (inUse) {
                warnings.push(
                    `${inUse} term(s) still use ${removed.join(', ')}. They keep the value, it is `
                    + 'reported as unknown on export, and editing one is refused until it is changed.',
                );
            }
        }
    }

    await vocabCollection(VOCAB_FACETS).replaceOne({ _id: id }, prepared, { upsert: true });
    return { facet: prepared, warnings };
}

// ---------------------------------------------------------------------------
// Forking — "use a separate copy here"
// ---------------------------------------------------------------------------

/**
 * Copy a term and repoint one collection's placements at the copy.
 *
 * ## Why this exists rather than a policy
 *
 * When several collections share a term, an edit raises a question with two legitimate answers:
 * change it everywhere, or change it only here. Neither is right in general — a corrected definition
 * belongs everywhere, a term one audience uses differently does not — so the system does not choose.
 * It shows where the term is used and asks, and this is the second answer.
 *
 * ## What it costs, and why the caller must be told
 *
 * **A fork mints a new identifier.** For a consumer keying on `vmc:c-0000b8` that is a breaking
 * change dressed up as an edit: the term they were reading is still there, but the one in *this*
 * collection is now something else. That is why the two options are not presented as symmetric.
 *
 * The copy records `forkedFrom`, so the relationship is recoverable — someone looking at two similar
 * terms can see that one came from the other rather than guessing.
 *
 * @param {string} termId - The term to copy
 * @param {string} inCollection - The collection whose placements move to the copy
 * @param {string} [actor]
 * @returns {Promise<{term: object, repointed: number}>}
 * @throws {ValidationError}
 */
export async function forkTerm(termId, inCollection, actor) {
    const source = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    if (!source) throw new ValidationError([`No such term: ${termId}`]);

    const container = await containerOf(inCollection);
    if (!container) throw new ValidationError([`No such container: ${inCollection}`]);

    const placements = (container.doc.member ?? []).filter((member) => member.term === termId);
    if (!placements.length) {
        throw new ValidationError([`${termId} is not placed in ${inCollection}, so there is nothing to fork`]);
    }

    const [newId] = await mintTermIds(1);
    const {
        _id: _sourceId, migrated: _migrated, modified: _modified, modifiedBy: _by, ...content
    } = source;

    const copy = stamped({ ...content, _id: newId, forkedFrom: termId }, actor);
    await vocabCollection(VOCAB_TERMS).insertOne(copy);

    // Only this container's placements move. Every other one keeps the original, which is the whole
    // point — a fork is local by definition.
    const repointed = (container.doc.member ?? []).map((member) => (
        member.term === termId ? { ...member, term: newId } : member
    ));
    await vocabCollection(container.store).updateOne(
        { _id: inCollection },
        { $set: { member: repointed, modified: new Date().toISOString(), modifiedBy: actor ?? 'unknown' } },
    );

    return { term: copy, repointed: placements.length };
}
