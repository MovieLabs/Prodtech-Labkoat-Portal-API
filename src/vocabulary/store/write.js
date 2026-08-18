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
import { collectionId, mintTermIds } from './ids.js';
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
        await Promise.all(removedFrom.map((collectionId_) => repairParents(collectionId_)));
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

    const id = collectionId(name);
    const clash = await vocabCollection(VOCAB_COLLECTIONS).findOne({ _id: id });
    if (clash) throw new ValidationError([`A collection named "${name}" already exists (${id})`]);

    const prepared = stamped({
        skosAs: 'collection', // Not a scheme unless asked: a scheme is a claim about what this is
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
