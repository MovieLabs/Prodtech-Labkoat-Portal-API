/**
 * What every route over the vocabulary's database shares: who may call it, and how a refused write
 * is answered.
 *
 * ## Two kinds of caller, both legitimate
 *
 * A build script in another repository fetches a view with a service token. The Portal is a consumer
 * too, and it holds a user token. Requiring one would lock out the browser; requiring the other
 * would lock out the build.
 *
 * So a request is accepted if **either** validates. That is not a weakening: each still verifies its
 * own issuer and signature, and a token from neither is refused. What the two may *do* differs —
 * see `machineReadOnly` below.
 *
 * @module routes/vocabGuards
 */

import { cognitoValidator } from 'mlHelpers';

import { actorFor } from '../auth/actor.js';
import config from '../config.js';
import { ConflictError, ValidationError } from '../vocabulary/store/concurrency.js';

/**
 * A browser user, or a machine.
 *
 * The vocabulary is published for builds in other repositories as well as for the Portal, so these
 * routes accept a service token where the user-facing routes do not. Both come from the same Cognito
 * pool; they are told apart by their claims, since a machine token carries a scope and no
 * `cognito:groups` while a user's carries the reverse.
 *
 * **The machine credential is this service's own, not the one it presents to fMam.** They were the
 * same client and the same scope, so whoever was given access to the published vocabulary was
 * thereby given access to the OMC store as well — one credential opening two services. A build that
 * reads a view now holds `labkoat/vocab.read`, which fMam does not accept, and the fMam service
 * token no longer opens anything here.
 */
const validated = cognitoValidator({
    userPoolId: config.USER_POOL_ID,
    machine: config.COGNITO_VOCAB_CLIENT_ID
        ? { clientId: config.COGNITO_VOCAB_CLIENT_ID, scope: config.COGNITO_VOCAB_SCOPE }
        : null,
    user: { clientId: config.CLIENT_ID, group: 'labkoat' },
});

/**
 * A machine reads; it does not write.
 *
 * The vocabulary is edited by people, in the Portal, against a user token that says who they are —
 * which is what every write here stamps as its actor. A service token names a client and nobody, so
 * a write behind one lands in the audit trail attributed to a machine, and there is no use for that
 * yet. Refused rather than merely unused: the credential is handed to other repositories, and what
 * it cannot do should not depend on what they choose to call.
 *
 * @param {object} req
 * @param {object} res
 * @param {Function} next
 */
function machineReadOnly(req, res, next) {
    if (req.tokenKind === 'machine' && req.method !== 'GET') {
        res.status(403).json({ message: 'This token may read the vocabulary but not change it' });
        return;
    }
    next();
}

/**
 * Both, in order, as one guard.
 *
 * An array because every route names this once, and Express takes a list wherever it takes a
 * middleware — so the read-only rule cannot be forgotten on a route added later.
 */
export const authenticated = [validated, machineReadOnly];

/**
 * `?status=published,review` overrides the view's own default.
 *
 * @param {object} query
 * @returns {string[]|null}
 */
export const statusFrom = ((query) => (typeof query.status === 'string' && query.status.length
    ? query.status.split(',').map((value) => value.trim()).filter(Boolean)
    : null));

/**
 * Turn a refused write into a 422 carrying every reason, or a stale one into a 409.
 *
 * Every reason, not the first: a caller fixing one error at a time round-trips once per mistake,
 * and the editor can show them together.
 *
 * **409 is a different answer from 422.** A validation failure says the payload is wrong and will
 * still be wrong if retried; a conflict says the payload was fine but is now built on a copy
 * somebody else has moved on from. The current document rides along so a client can offer to reload
 * without asking again.
 *
 * @param {Error} err
 * @param {object} res
 * @param {Function} next
 */
export function writeFailed(err, res, next) {
    if (err instanceof ConflictError) {
        res.status(409).json({ message: err.message, errors: err.errors, current: err.current });
        return;
    }
    if (err instanceof ValidationError) {
        res.status(422).json({ message: err.message, errors: err.errors });
        return;
    }
    next(err);
}

/**
 * Who is writing, for the record stamp.
 *
 * **Asynchronous, because the token does not know.** An access token carries no email, so the name
 * is asked of Cognito and held — see `auth/actor`. It never throws and never blocks a write: an
 * unresolvable caller is stamped with the token's own claim, exactly as before.
 */
export const actorOf = ((req) => actorFor(req));

/**
 * What the caller believes it is editing, from `If-Match`.
 *
 * The document's `modified`, quoted or not — a browser is entitled to send `If-Match: "..."` and
 * some proxies add the quotes. Absent means "write regardless", which is what every client did
 * before this existed and what a create still does.
 *
 * @param {object} req
 * @returns {string|undefined}
 */
export const basedOnOf = ((req) => {
    const header = req.headers['if-match'];
    if (!header || header === '*') return undefined;
    return String(header).replace(/^W\//, '').replace(/^"|"$/g, '');
});
