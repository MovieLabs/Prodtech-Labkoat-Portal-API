/**
 * Refusing a write, stamping one, and asserting what it was based on.
 *
 * Shared by every store that keeps documents in the vocabulary's database — terms, views and facets,
 * and the edge definitions beside them — so a stale write is refused the same way whichever
 * collection it lands in.
 *
 * @module vocabulary/store/concurrency
 */

import { vocabCollection } from './collections.js';

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

/**
 * When a record last changed, and who changed it.
 *
 * **Every write sets these, including one that only touches a corner of a document.** They are what
 * a conditional write asserts against, so a document that changed without saying so is one a stale
 * writer would still be allowed to overwrite. Offered as fields as well as a whole-document wrapper
 * because a `$set` cannot use the latter.
 *
 * @param {string} [actor]
 * @returns {{modified: string, modifiedBy: string}}
 */
export const stampFields = ((actor) => ({
    modified: new Date().toISOString(),
    modifiedBy: actor ?? 'unknown',
}));

/** Stamped on every write, so a record can say when it last changed and who changed it. */
export const stamped = ((doc, actor) => ({ ...doc, ...stampFields(actor) }));

/**
 * Raised when a write was built on a copy somebody else has since changed.
 *
 * Carries the document as it now stands, so a caller can offer to reload without a second round
 * trip. Separate from `ValidationError` because it is not a complaint about the payload — the same
 * write would have been accepted a moment earlier.
 */
export class ConflictError extends Error {
    constructor(message, current) {
        super(message);
        this.name = 'ConflictError';
        this.errors = [message];
        this.current = current;
    }
}

/**
 * The filter a write uses to assert what it was based on.
 *
 * **Concurrency-safe by filter, not by lock** — the same shape fMam's edge cleanup uses, and for the
 * same reason: it needs no state on the server, so it survives more than one replica. With no
 * expectation it degrades to an ordinary write by `_id`, which is what keeps a client that does not
 * yet send one working unchanged.
 *
 * @param {string} id
 * @param {string} [expected] - The `modified` the caller read
 * @returns {object}
 */
export const basedOn = ((id, expected) => (expected ? { _id: id, modified: expected } : { _id: id }));

/**
 * Refuse a write whose precondition did not hold, naming who got there first.
 *
 * Only called once a write has already matched nothing, so the re-read is off the failure path.
 *
 * @param {string} store
 * @param {string} id
 * @param {string} what - What the caller was writing, for the message
 * @throws {ConflictError|ValidationError}
 */
export async function refuseAsStale(store, id, what) {
    const current = await vocabCollection(store).findOne({ _id: id });
    // Gone rather than changed. A different failure, and a different thing to tell somebody.
    if (!current) throw new ValidationError([`No such ${what}: ${id}`]);
    throw new ConflictError(
        `This ${what} was changed by ${current.modifiedBy ?? 'someone else'} while you were editing it.`,
        current,
    );
}

/**
 * Replace a document, asserting nobody has changed it since it was read.
 *
 * For the writes that re-read on the server and then replace. The window is milliseconds rather than
 * the minutes an editor sits open, but it is the window `nextMid` mints in — two people adding a row
 * to one container both compute `m{highest+1}` from what they read, and without this the second lands
 * a duplicate mid, which a placement key cannot tell from the first.
 *
 * A document carrying no `modified` — a seed nobody has edited — writes unconditionally rather than
 * never, so this cannot brick anything the stamp has not reached yet.
 *
 * @param {string} store
 * @param {object} was - The document as read, for its `_id` and `modified`
 * @param {object} next
 * @param {string} what - What it is, for the refusal message
 * @throws {ConflictError}
 */
export async function replaceUnchanged(store, was, next, what) {
    const written = await vocabCollection(store).replaceOne(basedOn(was._id, was.modified), next);
    if (!written.matchedCount) await refuseAsStale(store, was._id, what);
}
