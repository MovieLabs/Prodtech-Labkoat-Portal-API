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

import { PROFILE_KINDS, profileKindOf } from '../exportProfiles.js';

import {
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    vocabCollection,
} from './collections.js';
import { mintTermIds, nextForkId, readArrangementContainer, viewId as viewId_ } from './ids.js';
import { normaliseFacet, normaliseTerm, normaliseView } from './normalise.js';
import { arrangementOf, listFacets, termUsage } from './read.js';
import {
    allowedFacetValues,
    checkArrangementRemoval,
    checkTermDeletion,
    validateExportProfile,
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

    // Tidied before anything looks at it, so the duplicate-label check compares what will be stored
    // rather than what happened to be pasted.
    const prepared = terms.map((term, index) => stamped(normaliseTerm({
        status: 'proposed', // The safe default: a new term is a proposal until somebody says otherwise
        label: [],
        note: [],
        example: [],
        definition: {},
        ...term,
        _id: ids[index],
    }), actor));

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

    // **An empty arrangement is not an arrangement.** Carrying `member: []` puts a term in a state
    // that is neither: the palette leaves it out, because a collection with nothing in it is not
    // something to place, while `unarrangeSubtree` refuses it as carrying no arrangement — so a term
    // emptied row by row could not be reverted and could not be used. Dropped on write instead, so
    // taking the last row out of an arrangement is the same act as reverting it. The same for forks.
    const tidied = normaliseTerm({ ...term });
    if (Array.isArray(tidied.member) && !tidied.member.length) delete tidied.member;
    if (Array.isArray(tidied.fork) && !tidied.fork.length) delete tidied.fork;

    const prepared = stamped({ ...tidied, _id: id }, actor);

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
            // **Both places a row can sit.** A term's forks hold members too, and a row left inside
            // one names a term that no longer exists — the same hole this whole step exists to
            // prevent, in the one container a `member` pull does not reach.
            store === VOCAB_TERMS
                ? { $pull: { 'member': { term: id }, 'fork.$[].member': { term: id } } }
                : { $pull: { member: { term: id } } },
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

    // Promoted to the top rather than guessed at: the parent is gone, so the chain above it is no
    // longer knowable from this document alone. Every arrangement in the document is checked, since
    // a term's forks each hold their own rows and their own mids.
    const repair = ((rows) => {
        const mids = new Set((rows ?? []).map((member) => member.mid));
        const orphaned = (rows ?? []).some((member) => member.parent && !mids.has(member.parent));
        if (!orphaned) return null;
        return rows.map((member) => (
            member.parent && !mids.has(member.parent) ? { ...member, parent: null } : member
        ));
    });

    const member = repair(container.member);
    const forks = (container.fork ?? []).map((fork) => {
        const fixed = repair(fork.member);
        return fixed ? { ...fork, member: fixed } : fork;
    });
    const forkChanged = forks.some((fork, i) => fork !== (container.fork ?? [])[i]);
    if (!member && !forkChanged) return;

    const set = {};
    if (member) set.member = member;
    if (forkChanged) set.fork = forks;
    await vocabCollection(store).updateOne({ _id: id }, { $set: set });
}

// ---------------------------------------------------------------------------
// Arrangements
// ---------------------------------------------------------------------------

/**
 * The document that declares a member list, which store it lives in, and where in it the rows sit.
 *
 * A container is a view holding its own members, a term's default arrangement, or one of that
 * term's forks. **Asked rather than read off the id** — `view:` is a slug convention, not a rule
 * anything should depend on — except for the fork suffix, which *is* a rule and is the one thing an
 * id has to carry, because a term's forks are all inside the one document.
 *
 * `members` and `withMembers` are what let a caller edit rows without knowing which of the three it
 * has. Reaching for `doc.member` directly works for two of them and silently edits the wrong list
 * for the third.
 *
 * @param {string} id
 * @returns {Promise<{doc: object, store: string, members: Array<object>,
 *   withMembers: function(Array<object>): object}|null>}
 */
async function containerOf(id) {
    const { termId, forkId } = readArrangementContainer(id);

    if (!forkId) {
        const view = await vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
        if (view) {
            return {
                doc: view,
                store: VOCAB_VIEWS,
                members: view.member ?? [],
                withMembers: ((next) => ({ ...view, member: next })),
            };
        }
    }

    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    if (!term) return null;

    if (!forkId) {
        return {
            doc: term,
            store: VOCAB_TERMS,
            members: term.member ?? [],
            withMembers: ((next) => ({ ...term, member: next })),
        };
    }

    const at = (term.fork ?? []).findIndex((fork) => fork.id === forkId);
    if (at < 0) return null;
    return {
        doc: term,
        store: VOCAB_TERMS,
        members: term.fork[at].member ?? [],
        withMembers: ((next) => ({
            ...term,
            fork: term.fork.map((fork, i) => (i === at ? { ...fork, member: next } : fork)),
        })),
    };
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

    const { members } = container;
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
    const source = stamped(container.withMembers(remaining), actor);

    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: term._id }, arranged);
    await vocabCollection(container.store).replaceOne({ _id: container.doc._id }, source);

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

    const { members } = container;
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

    const source = stamped(container.withMembers(remaining), actor);
    const { member: _wasArranged, ...plain } = term;
    const bare = stamped(plain, actor);

    await vocabCollection(container.store).replaceOne({ _id: container.doc._id }, source);
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

    const source = from.members;
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
        const updated = stamped(from.withMembers(insertUnder(rest, taken, toParent)), actor);
        await vocabCollection(from.store).replaceOne({ _id: from.doc._id }, updated);
        return { moved: taken.length, repointed: 0, mid };
    }

    // Across containers. Remint anything that would collide, before the rows are rewritten, so a
    // parent and its children agree on the new id.
    const target = to.members;
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
    const landed = insertUnder(target, taken, toParent);

    if (from.doc._id === to.doc._id) {
        // **Two containers, one document.** Moving between a term's default arrangement and one of
        // its forks reaches the same record twice, and writing the two halves in turn would have the
        // second overwrite the first — the rows would arrive and the ones they left would come back.
        // Composed instead, and written once.
        const both = stamped(
            { ...from.withMembers(remaining), ...to.withMembers(landed) },
            actor,
        );
        await vocabCollection(from.store).replaceOne({ _id: from.doc._id }, both);
    } else {
        const nextSource = stamped(from.withMembers(remaining), actor);
        const nextTarget = stamped(to.withMembers(landed), actor);

        // The source first: if the second write fails the rows are gone rather than duplicated, and
        // a duplicate placement is the harder of the two to find afterwards.
        await vocabCollection(from.store).replaceOne({ _id: from.doc._id }, nextSource);
        await vocabCollection(to.store).replaceOne({ _id: to.doc._id }, nextTarget);
    }

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

/**
 * Give a term another arrangement of its own.
 *
 * ## What a fork is, and what it deliberately is not
 *
 * **One term, one identifier, one definition — several hierarchies.** Lens means the same thing
 * wherever it appears; what a fork varies is how Lens is *arranged* beneath. This is the opposite of
 * copying the term, which is why copying was taken out: two records for one meaning is what this
 * model exists to prevent.
 *
 * A placement chooses which arrangement it brings by naming the fork on its row. Naming none brings
 * the default, which is every row written before forks existed.
 *
 * ## Empty or a copy, because a big tree and a small one want different answers
 *
 * Copying a fourteen-child arrangement to change two of them is pruning work; starting an empty one
 * for a two-child hierarchy is retyping. Both are offered rather than guessed at.
 *
 * **A copy takes the rows as they are, mids and all.** Mids are scoped to their container and a fork
 * is a new container, so nothing collides and nothing has to be reminted — and a `view.arrange.hide`
 * key naming the default's `m3` still names the default's, never the copy's.
 *
 * @param {string} termId
 * @param {object} params
 * @param {string} params.name - What the palette will call it
 * @param {string|null} [params.copyOf] - A fork id, or `null` for the default arrangement. Omit
 *   entirely for an empty fork
 * @param {boolean} [params.empty] - True for a fork with no members
 * @param {string} [actor]
 * @returns {Promise<{term: object, fork: object}>}
 * @throws {ValidationError}
 */
export async function createFork(termId, { name, copyOf = null, empty = false }, actor) {
    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    if (!term) throw new ValidationError([`No such term: ${termId}`]);
    if (!name || !String(name).trim()) throw new ValidationError(['A fork needs a name']);

    const wanted = String(name).trim();
    const taken = term.arrangementName === wanted
        || (term.fork ?? []).some((fork) => fork.name === wanted);
    if (taken) throw new ValidationError([`"${termId}" already has an arrangement called "${wanted}"`]);

    let member = [];
    if (!empty) {
        const source = arrangementOf(term, copyOf);
        if (source === null) {
            throw new ValidationError([`No such arrangement to copy: ${copyOf ?? 'the default'}`]);
        }
        member = source.map((row) => ({ ...row }));
    }

    const fork = { id: nextForkId(term.fork ?? []), name: wanted, member };
    const next = stamped({ ...term, fork: [...(term.fork ?? []), fork] }, actor);
    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: termId }, next);
    return { term: next, fork };
}

/**
 * Rename a fork.
 *
 * **Nothing published moves.** Rows point at the fork's id, which is minted once and never reused,
 * for the same reason a scheme URI is derived from a term id rather than from its label.
 *
 * @param {string} termId
 * @param {string} forkId
 * @param {string} name
 * @param {string} [actor]
 * @returns {Promise<{term: object}>}
 * @throws {ValidationError}
 */
export async function renameArrangement(termId, forkId, name, actor) {
    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    if (!term) throw new ValidationError([`No such term: ${termId}`]);
    if (!name || !String(name).trim()) throw new ValidationError(['An arrangement needs a name']);

    const wanted = String(name).trim();
    const named = [
        ...(term.arrangementName ? [{ id: null, name: term.arrangementName }] : []),
        ...(term.fork ?? []),
    ];
    if (named.some((one) => one.id !== forkId && one.name === wanted)) {
        throw new ValidationError([`"${termId}" already has an arrangement called "${wanted}"`]);
    }

    // **The default is renamed on the term, a fork inside its own entry.** Two places because they
    // are two shapes, and one call because to the person doing it they are the same act: naming the
    // hierarchy they are looking at.
    let next;
    if (!forkId) {
        if (!term.member?.length) throw new ValidationError([`"${termId}" carries no arrangement to name`]);
        next = stamped({ ...term, arrangementName: wanted }, actor);
    } else {
        if (!(term.fork ?? []).some((fork) => fork.id === forkId)) {
            throw new ValidationError([`"${termId}" has no fork "${forkId}"`]);
        }
        next = stamped({
            ...term,
            fork: term.fork.map((fork) => (fork.id === forkId ? { ...fork, name: wanted } : fork)),
        }, actor);
    }
    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: termId }, next);
    return { term: next };
}

/**
 * Delete a fork.
 *
 * **Refused while anything still places it**, unless forced. A row naming a fork that has gone
 * publishes nothing beneath it and the resolver reports it — recoverable, but silent until somebody
 * opens that view, so the write says so instead. The usage is returned with the refusal so a caller
 * can name where.
 *
 * The rows *inside* the fork are placements, not terms: deleting it removes the arrangement, never
 * the terms it arranged.
 *
 * @param {string} termId
 * @param {string} forkId
 * @param {boolean} [force]
 * @param {string} [actor]
 * @returns {Promise<{term: object, placements: number}>}
 * @throws {ValidationError}
 */
export async function deleteFork(termId, forkId, force = false, actor) {
    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: termId });
    if (!term) throw new ValidationError([`No such term: ${termId}`]);
    if (!(term.fork ?? []).some((fork) => fork.id === forkId)) {
        throw new ValidationError([`"${termId}" has no fork "${forkId}"`]);
    }

    // A row that brings this fork, wherever such a row can sit: a view's own list, a term's default
    // arrangement, or inside another fork.
    const brings = { $elemMatch: { term: termId, arrangement: forkId } };
    const [terms, views] = await Promise.all([
        vocabCollection(VOCAB_TERMS)
            .find({ $or: [{ member: brings }, { fork: { $elemMatch: { member: brings } } }] })
            .toArray(),
        vocabCollection(VOCAB_VIEWS).find({ member: brings }).toArray(),
    ]);
    const placements = terms.length + views.length;
    if (placements && !force) {
        throw new ValidationError([
            `${placements} placement(s) still bring this fork. Point them at another arrangement `
            + 'first, or delete it anyway and they will publish nothing beneath them.',
        ]);
    }

    const next = stamped({ ...term, fork: term.fork.filter((fork) => fork.id !== forkId) }, actor);
    await vocabCollection(VOCAB_TERMS).replaceOne({ _id: termId }, next);
    return { term: next, placements };
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
    const prepared = stamped(normaliseView({ labelStyle: 'plain', member: [], ...view, _id: id }), actor);

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
 * @param {boolean} [force=false] - Remove a value terms still carry
 * @returns {Promise<{facet: object, warnings: string[]}>}
 * @throws {ValidationError} When a removed value is still in use and `force` is not set
 */
export async function saveFacet(id, facet, actor, force = false) {
    if (!facet?.appliesTo || !facet?.key) {
        throw new ValidationError(['A facet must say what it applies to and which key its values carry']);
    }

    const prepared = stamped(normaliseFacet({ ...facet, _id: id }), actor);
    const warnings = [];

    const previous = await vocabCollection(VOCAB_FACETS).findOne({ _id: id });
    if (previous) {
        const before = new Set((previous.values ?? []).map((value) => value[previous.key]));
        const after = new Set((prepared.values ?? []).map((value) => value[prepared.key]));
        const removed = [...before].filter((value) => !after.has(value));

        if (removed.length) {
            const inUse = await vocabCollection(VOCAB_TERMS)
                .countDocuments({ [`${prepared.appliesTo}.${prepared.key}`]: { $in: removed } });
            // **Refused, not warned.** A value removed while terms still carry it does not rewrite
            // those terms — that would be a list edit silently changing hundreds of records — so
            // they keep a value the controlled set no longer admits. The consequence lands nowhere
            // near the action: the export reports the value as unknown rather than omitting it, and
            // `validateTerm` refuses the next edit to every one of those terms. Removing `omcToken`
            // blocked a sixth of the vocabulary this way.
            //
            // To stop a type reaching an export, give it `skos: null` instead. That is what the
            // projection is for, and it costs nothing.
            if (inUse && !force) {
                throw new ValidationError([
                    `${inUse} term(s) still use ${removed.join(', ')}, and would keep a value this `
                    + 'set no longer admits — the export would report it as unknown, and editing any '
                    + 'of those terms would be refused.',
                    'To stop a type being exported while leaving the terms alone, set its SKOS '
                    + 'projection to none rather than removing it.',
                    'Pass force=true to remove it anyway.',
                ]);
            }
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

/**
 * Write one format's export profile onto a view.
 *
 * **A `$set` on one key, not a replace.** `saveView` writes the whole document, which is why every
 * caller of it has to load the record and spread it first — and why the tag map and the `arrange`
 * lists have each had to be rescued from a body built from a form's fields alone. A profile written
 * through that door would be the third time. This touches `export.<kind>` and nothing else, the same
 * reasoning that makes `writeArrange` the only place `arrange` is written.
 *
 * @param {string} id - The view
 * @param {string} format
 * @param {object} profile
 * @param {string} [actor]
 * @returns {Promise<object>} The view as stored
 * @throws {ValidationError} On an unknown view, format, or an unpublishable column
 */
export async function saveExportProfile(id, format, profile, actor) {
    const view = await vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
    if (!view) throw new ValidationError([`No such view: ${id}`]);

    const facets = await listFacets();
    const check = validateExportProfile(profile, format, facets);
    if (!check.ok) throw new ValidationError(check.errors);

    const kind = profileKindOf(format);
    await vocabCollection(VOCAB_VIEWS).updateOne(
        { _id: id },
        {
            $set: {
                [`export.${kind}`]: profile,
                modified: new Date().toISOString(),
                modifiedBy: actor ?? 'unknown',
            },
        },
    );

    return vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
}

/**
 * Take a format's profile off a view, so it publishes the default again.
 *
 * A way back matters more here than it usually does: a profile can leave a property out of the
 * output by declaration, so somebody looking at a file missing half its columns needs one action
 * that undoes the configuring rather than a column list to reconstruct by hand.
 *
 * @param {string} id
 * @param {string} format
 * @param {string} [actor]
 * @returns {Promise<object>} The view as stored
 * @throws {ValidationError} On an unknown view or format
 */
export async function deleteExportProfile(id, format, actor) {
    const view = await vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
    if (!view) throw new ValidationError([`No such view: ${id}`]);

    const kind = profileKindOf(format);
    if (!PROFILE_KINDS.includes(kind)) {
        throw new ValidationError([`"${format}" is not a format a profile can be written for`]);
    }

    await vocabCollection(VOCAB_VIEWS).updateOne(
        { _id: id },
        {
            $unset: { [`export.${kind}`]: '' },
            $set: {
                modified: new Date().toISOString(),
                modifiedBy: actor ?? 'unknown',
            },
        },
    );

    return vocabCollection(VOCAB_VIEWS).findOne({ _id: id });
}
