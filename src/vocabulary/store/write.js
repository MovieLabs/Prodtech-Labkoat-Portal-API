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
    VOCAB_COLLECTIONS,
    VOCAB_FACETS,
    VOCAB_TERMS,
    VOCAB_VIEWS,
    vocabCollection,
} from './collections.js';
import { collectionId as collectionId_, mintTermIds, viewId as viewId_ } from './ids.js';
import { collectionUsage, termUsage } from './read.js';
import {
    allowedFacetValues,
    checkCollectionDeletion,
    checkTermDeletion,
    validateCollection,
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
            .map((label) => `"${label.value}" already names ${term._id}`));
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

    const removedFrom = usage.collections.map((collection) => collection._id);
    if (removedFrom.length) {
        await vocabCollection(VOCAB_COLLECTIONS).updateMany(
            { _id: { $in: removedFrom } },
            { $pull: { member: { term: id } } },
        );
        // A member whose parent was one of the removed members is now orphaned. Re-parenting them to
        // the removed member's parent is the same promotion the resolver does for a filtered term,
        // and keeps the collection valid rather than leaving it to fail validation later.
        await Promise.all(removedFrom.map((id_) => repairParents(id_)));
    }

    const outcome = await vocabCollection(VOCAB_TERMS).deleteOne({ _id: id });
    return { deleted: outcome.deletedCount > 0, warnings: check.warnings, removedFrom };
}

/**
 * Re-attach members whose parent has gone.
 *
 * @param {string} id - The collection to repair
 * @returns {Promise<void>}
 */
async function repairParents(id) {
    const collection = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: id });
    if (!collection) return;

    const mids = new Set((collection.member ?? []).map((member) => member.mid));
    const orphaned = (collection.member ?? []).filter((member) => member.parent && !mids.has(member.parent));
    if (!orphaned.length) return;

    // Promoted to the top rather than guessed at: the parent is gone, so the chain above it is no
    // longer knowable from this document alone.
    const repaired = (collection.member ?? []).map((member) => (
        member.parent && !mids.has(member.parent) ? { ...member, parent: null } : member
    ));
    await vocabCollection(VOCAB_COLLECTIONS).updateOne({ _id: id }, { $set: { member: repaired } });
}

// ---------------------------------------------------------------------------
// Collections
// ---------------------------------------------------------------------------

/**
 * Create a collection.
 *
 * The id is a slug of the name, continuing what schemes already do so an id stays recognisable in an
 * export and a URL. **A slug does not survive a rename** — renaming must change the label and keep
 * the id, or every view rooted on the collection breaks.
 *
 * @param {object} collection - Without `_id`
 * @param {string} [actor]
 * @returns {Promise<object>}
 * @throws {ValidationError}
 */
export async function createCollection(collection, actor) {
    const name = (collection.label ?? []).find((label) => label.labelType === 'pref')?.value;
    if (!name) throw new ValidationError(['A collection must have a preferred label']);

    const id = collectionId_(name);
    const clash = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: id });
    if (clash) throw new ValidationError([`A collection named "${name}" already exists (${id})`]);

    const prepared = stamped({
        // A collection is a term made reusable, so it emits no node of its own and its members
        // come out where it sits. Nothing asks for anything else any more — the pickers that
        // offered the other two values are gone, and the flag itself goes with the export work.
        projections: { skos: 'transparent' },
        member: [],
        definition: {},
        ...collection,
        _id: id,
    }, actor);

    const check = validateCollection(prepared);
    if (!check.ok) throw new ValidationError(check.errors);

    await vocabCollection(VOCAB_COLLECTIONS).insertOne(prepared);
    return prepared;
}

/**
 * Replace a collection — its label, its projection, and its whole member list.
 *
 * The member list arrives entire because that is how the editor holds it: re-parenting, reordering
 * and removing are all edits to one array, and sending a diff of them would be reconstructing on the
 * server what the client already knows.
 *
 * @param {string} id
 * @param {object} collection
 * @param {string} [actor]
 * @returns {Promise<object>}
 * @throws {ValidationError}
 */
export async function replaceCollection(id, collection, actor) {
    const existing = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: id });
    if (!existing) throw new ValidationError([`No such collection: ${id}`]);

    const prepared = stamped({ ...collection, _id: id }, actor);
    const check = validateCollection(prepared);
    if (!check.ok) throw new ValidationError(check.errors);

    // Every term a member names must exist, or the collection renders with holes.
    const termIds = (prepared.member ?? []).map((member) => member.term).filter(Boolean);
    if (termIds.length) {
        const found = await vocabCollection(VOCAB_TERMS)
            .find({ _id: { $in: termIds } }, { projection: { _id: 1 } })
            .toArray();
        const known = new Set(found.map((term) => term._id));
        const missing = [...new Set(termIds.filter((termId) => !known.has(termId)))];
        if (missing.length) throw new ValidationError([`These terms do not exist: ${missing.join(', ')}`]);
    }

    const { migrated: _migrated, ...keep } = existing;
    await vocabCollection(VOCAB_COLLECTIONS).replaceOne({ _id: id }, { ...keep, ...prepared });
    return prepared;
}

/**
 * Take a term and everything under it into a collection of its own.
 *
 * ## What this is for
 *
 * **A collection is the unit of reuse, and a hierarchy is usually a subtree inside one.** `Asset`
 * holds 122 members, of which `Asset Function` and its descendants are 80. Another view can include
 * `Asset` whole, and nothing lets it include just that subtree — so an arrangement somebody built
 * cannot be used elsewhere without being rebuilt by hand, and the rebuild is a copy that drifts.
 *
 * After this the subtree is a collection, so it can be included anywhere, live.
 *
 * ## Why the term is still a concept afterwards
 *
 * The new collection is `transparent`: it exports as nothing and its members come out as though they
 * sat where it does. `broaderOf` and `topConceptOf` count **term** entries only and skip collections,
 * so the term at the head keeps the same `broader`, and a top concept stays a top concept. The SKOS
 * output does not change. The collection is a handle, not a thing in the vocabulary.
 *
 * ## The three things that have to be got exactly right
 *
 * - **The inclusion takes the moved row's array position.** Array order is sibling order, so adding
 *   it at the end would silently reorder the source.
 * - **Mids are preserved**, so the arrangement inside the subtree is untouched. But a placement key
 *   is `collectionId/mid`, so every `view.arrange` entry naming a moved row is repointed at the new
 *   collection — otherwise a hidden heading quietly comes back.
 * - **Two documents are written and no transaction is asked for.** The new collection goes first: if
 *   the second write fails the term is placed twice, which is visible and removable, where the other
 *   order would lose the rows.
 *
 * @param {string} id - The collection holding the subtree
 * @param {object} params
 * @param {string} params.mid - The member row of the term to take
 * @param {string} [params.name] - The new collection's name; defaults to the term's preferred label
 * @param {string} [actor]
 * @returns {Promise<{collection: object, source: object, moved: number, repointed: number}>}
 * @throws {ValidationError}
 */
export async function extractSubtree(id, { mid, name }, actor) {
    const source = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: id });
    if (!source) throw new ValidationError([`No such collection: ${id}`]);

    const members = source.member ?? [];
    const at = members.findIndex((member) => member.mid === mid);
    if (at < 0) throw new ValidationError([`No member "${mid}" in ${id}`]);

    const row = members[at];
    if (!row.term) {
        throw new ValidationError(['Only a term can be taken into a collection — a collection member is already reusable']);
    }

    // Everything below it, at any depth. A queue rather than recursion, for the reason
    // `descendantsOf` uses one: this runs on data somebody may be midway through editing.
    const moved = new Set([mid]);
    let frontier = [mid];
    while (frontier.length) {
        const next = [];
        members.forEach((member) => {
            if (frontier.includes(member.parent) && !moved.has(member.mid)) {
                moved.add(member.mid);
                next.push(member.mid);
            }
        });
        frontier = next;
    }

    const term = await vocabCollection(VOCAB_TERMS).findOne({ _id: row.term });
    const label = name ?? (term?.label ?? []).find((entry) => entry.labelType === 'pref')?.value;
    if (!label) throw new ValidationError(['The new collection needs a name']);

    const newId = collectionId_(label);
    const clash = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: newId });
    if (clash) throw new ValidationError([`A collection named "${label}" already exists (${newId})`]);

    // The moved rows in the order they were in. The head loses its parent — it is the top of its own
    // collection now — and the rest keep theirs, which all point inside the moved set.
    const taken = members
        .filter((member) => moved.has(member.mid))
        .map((member) => {
            if (member.mid !== mid) return { ...member };
            const { parent: _wasParented, ...head } = member;
            return head;
        });

    const created = stamped({
        _id: newId,
        label: [{ value: label, language: 'en', labelType: 'pref' }],
        definition: term?.definition ?? {},
        // Emits nothing of its own, so its terms come out exactly where they did before.
        projections: { skos: 'transparent' },
        member: taken,
        extractedFrom: id,
    }, actor);

    const createdCheck = validateCollection(created);
    if (!createdCheck.ok) throw new ValidationError(createdCheck.errors);

    const remaining = members.filter((member) => !moved.has(member.mid));
    // Spliced in where the term row was, because array order is sibling order.
    const before = members.slice(0, at).filter((member) => !moved.has(member.mid)).length;
    const inclusion = { mid, collection: newId };
    if (row.parent) inclusion.parent = row.parent;
    remaining.splice(before, 0, inclusion);

    const updated = stamped({ ...source, member: remaining }, actor);
    const updatedCheck = validateCollection(updated);
    if (!updatedCheck.ok) throw new ValidationError(updatedCheck.errors);

    await vocabCollection(VOCAB_COLLECTIONS).insertOne(created);
    await vocabCollection(VOCAB_COLLECTIONS).replaceOne({ _id: id }, updated);

    const repointed = await repointArrange(id, newId, moved);

    return { collection: created, source: updated, moved: taken.length, repointed };
}

/**
 * Move every `view.arrange` entry naming one of the moved rows onto the new collection.
 *
 * A placement key is `collectionId/mid`, so a subtree changing hands invalidates every key naming
 * it. Left alone, a hidden heading silently reappears and a moved term silently returns to where it
 * was stored — both of them changes to a published artifact that nobody asked for.
 *
 * @param {string} fromId
 * @param {string} toId
 * @param {Set<string>} mids - The rows that moved
 * @returns {Promise<number>} How many views were rewritten
 */
async function repointArrange(fromId, toId, mids) {
    const swap = ((key) => {
        if (typeof key !== 'string') return key;
        const cut = key.indexOf('/');
        if (cut < 0) return key;
        const collection = key.slice(0, cut);
        const mid = key.slice(cut + 1);
        return collection === fromId && mids.has(mid) ? `${toId}/${mid}` : key;
    });

    const views = await vocabCollection(VOCAB_VIEWS).find({ arrange: { $exists: true } }).toArray();
    const rewritten = await Promise.all(views.map(async (view) => {
        const arrange = { ...view.arrange };
        if (view.arrange.hide) arrange.hide = view.arrange.hide.map(swap);
        if (view.arrange.move) {
            arrange.move = view.arrange.move.map((entry) => ({
                ...entry, placement: swap(entry.placement), under: swap(entry.under),
            }));
        }
        if (JSON.stringify(arrange) === JSON.stringify(view.arrange)) return 0;
        await vocabCollection(VOCAB_VIEWS).updateOne({ _id: view._id }, { $set: { arrange } });
        return 1;
    }));

    return rewritten.reduce((total, one) => total + one, 0);
}

/**
 * Delete a collection.
 *
 * The terms in it stay. They keep every other collection they belong to, and those left in none show
 * up in the unplaced collection — the same place a newly created term waits. Deleting the terms with
 * the collection would destroy meaning to remove an arrangement.
 *
 * @param {string} id
 * @param {boolean} [force=false]
 * @returns {Promise<{deleted: boolean, warnings: string[]}>}
 * @throws {ValidationError}
 */
export async function deleteCollection(id, force = false) {
    const usage = await collectionUsage(id);
    const check = checkCollectionDeletion(usage);

    if (!check.ok) throw new ValidationError(check.errors);
    if (check.warnings.length && !force) {
        throw new ValidationError([...check.warnings, 'Pass force=true to delete it anyway.']);
    }

    // Drop the inclusions pointing at it, so no collection is left naming something absent.
    await vocabCollection(VOCAB_COLLECTIONS).updateMany(
        { 'member.collection': id },
        { $pull: { member: { collection: id } } },
    );

    const outcome = await vocabCollection(VOCAB_COLLECTIONS).deleteOne({ _id: id });
    return { deleted: outcome.deletedCount > 0, warnings: check.warnings };
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
    const prepared = stamped({ labelStyle: 'plain', ...view, _id: id }, actor);

    const check = validateView(prepared, allowed);
    if (!check.ok) throw new ValidationError(check.errors);

    const root = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: prepared.root });
    if (!root) throw new ValidationError([`No such collection: ${prepared.root}`]);

    await vocabCollection(VOCAB_VIEWS).replaceOne({ _id: id }, prepared, { upsert: true });
    return prepared;
}

/**
 * Delete a view.
 *
 * **Nothing else goes with it.** A view names a collection and says how to publish it; the
 * collection, everything it reaches and every term in it are untouched, and another view rooted on
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
    return { deleted: outcome.deletedCount > 0, root: view.root };
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

    const collection = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: inCollection });
    if (!collection) throw new ValidationError([`No such collection: ${inCollection}`]);

    const placements = (collection.member ?? []).filter((member) => member.term === termId);
    if (!placements.length) {
        throw new ValidationError([`${termId} is not placed in ${inCollection}, so there is nothing to fork`]);
    }

    const [newId] = await mintTermIds(1);
    const {
        _id: _sourceId, migrated: _migrated, modified: _modified, modifiedBy: _by, ...content
    } = source;

    const copy = stamped({ ...content, _id: newId, forkedFrom: termId }, actor);
    await vocabCollection(VOCAB_TERMS).insertOne(copy);

    // Only this collection's placements move. Every other collection keeps the original, which is
    // the whole point — a fork is local by definition.
    const repointed = (collection.member ?? []).map((member) => (
        member.term === termId ? { ...member, term: newId } : member
    ));
    await vocabCollection(VOCAB_COLLECTIONS).updateOne(
        { _id: inCollection },
        { $set: { member: repointed, modified: new Date().toISOString(), modifiedBy: actor ?? 'unknown' } },
    );

    return { term: copy, repointed: placements.length };
}

/**
 * Copy a collection and repoint one including collection at the copy.
 *
 * The copy holds the same **terms**: forking an arrangement is not forking the meaning of what is
 * arranged. Its members keep pointing at the original terms, so a definition corrected later still
 * reaches both — which is almost always what is wanted, and the term-level fork above is there for
 * when it is not.
 *
 * @param {string} collectionId - The collection to copy
 * @param {string} name - The copy's preferred label; its id is a slug of this
 * @param {string|null} inCollection - The collection whose inclusion moves to the copy; null to
 *   create a detached copy that nothing yet includes
 * @param {string} [actor]
 * @returns {Promise<object>} The copy
 * @throws {ValidationError}
 */
export async function forkCollection(collectionId, name, inCollection, actor) {
    const source = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: collectionId });
    if (!source) throw new ValidationError([`No such collection: ${collectionId}`]);
    if (!name) throw new ValidationError(['A copy needs a name of its own']);

    const newId = collectionId_(name);
    const clash = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: newId });
    if (clash) throw new ValidationError([`A collection named "${name}" already exists (${newId})`]);

    const {
        _id: _sourceId, migrated: _migrated, modified: _modified, modifiedBy: _by, label, ...content
    } = source;

    const copy = stamped({
        ...content,
        _id: newId,
        label: [
            { value: name, language: 'en', labelType: 'pref' },
            // Any other label the source carried is kept; only the preferred one is replaced.
            ...(label ?? []).filter((entry) => entry.labelType !== 'pref'),
        ],
        forkedFrom: collectionId,
    }, actor);

    const check = validateCollection(copy);
    if (!check.ok) throw new ValidationError(check.errors);

    await vocabCollection(VOCAB_COLLECTIONS).insertOne(copy);

    if (inCollection) {
        const parent = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: inCollection });
        if (!parent) throw new ValidationError([`No such collection: ${inCollection}`]);
        const repointed = (parent.member ?? []).map((member) => (
            member.collection === collectionId ? { ...member, collection: newId } : member
        ));
        await vocabCollection(VOCAB_COLLECTIONS).updateOne(
            { _id: inCollection },
            { $set: { member: repointed, modified: new Date().toISOString(), modifiedBy: actor ?? 'unknown' } },
        );
    }

    return copy;
}
