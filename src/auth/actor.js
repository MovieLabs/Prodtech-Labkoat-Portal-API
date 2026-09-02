/**
 * Who is calling, in a form worth writing onto a record.
 *
 * ## Why this needs asking at all
 *
 * This service validates the **access** token, and a Cognito access token carries `sub`, `username`
 * and the group claims — no email and no name. Where a pool signs people in by an email alias,
 * `username` is the same opaque uuid as `sub`, so the token cannot say who its bearer is in any way
 * a person would recognise: a record stamped `58011380-e091-70a7-5833-4d4d9e58924d` names nobody,
 * which is worse than useless on a conflict notice whose whole job is to say who got there first.
 *
 * The email lives in the **id** token, which stays in the browser and never reaches a service — the
 * Portal's own navbar reads it from there. What does arrive here is an access token carrying the
 * `openid` and `email` scopes, and that is exactly what Cognito's `/oauth2/userInfo` answers for.
 *
 * **So the name is asked of the issuer, not taken from the caller.** A client could simply send its
 * own display name, and that would need no round trip — but then the name on a record would be
 * whatever the client claimed, unverified, on a field people use to decide whose edit to keep.
 *
 * ## A stamp must not cost a round trip
 *
 * Resolved once per person and held, because the answer changes about never and every write would
 * otherwise wait on Cognito. Failures are held too, briefly: a userInfo that is refusing must not
 * add a network call to every write for as long as it stays down.
 *
 * **In memory, per process, deliberately.** This is a cache and not state — a second replica simply
 * asks once itself. Nothing here is load-bearing: every failure falls back to the token's own
 * claims, so a name that cannot be resolved costs a plain uuid rather than a refused write.
 *
 * @module auth/actor
 */

import config from '../config.js';

/** How long a resolved name is trusted. Emails change about never; an hour is not a risk. */
const HOLD_MS = 60 * 60 * 1000;

/** How long a failure is remembered, so a broken endpoint is asked once a minute, not once a write. */
const HOLD_FAILURE_MS = 60 * 1000;

/** Cognito is being asked one small question; a write should not wait on it. */
const TIMEOUT_MS = 3000;

/** @type {Map<string, {name: string|null, until: number}>} By `sub`. */
const known = new Map();

/**
 * The bearer token as presented, or nothing.
 *
 * @param {object} req
 * @returns {string|null}
 */
const bearerOf = ((req) => {
    const header = req.headers?.authorization;
    if (typeof header !== 'string') return null;
    const [scheme, token] = header.split(' ');
    return scheme?.toLowerCase() === 'bearer' && token ? token : null;
});

/**
 * What the token says, when nothing better can be had.
 *
 * `username` first, because a pool that uses real usernames puts a real one there; it falls through
 * to `sub` for one that does not, which is the case this module exists to improve on.
 *
 * @param {object} req
 * @returns {string}
 */
export const claimedActor = ((req) => (
    req.user?.username ?? req.user?.sub ?? req.auth?.sub ?? 'service'
));

/**
 * Ask Cognito who this token belongs to.
 *
 * @param {string} token
 * @returns {Promise<string|null>} An email, or null where the endpoint had nothing to say
 */
async function askUserInfo(token) {
    const response = await fetch(config.COGNITO_USERINFO_URL, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const claims = await response.json().catch(() => null);
    // `email` is what the Portal asks for and what a reader recognises. `username` is accepted after
    // it only because a pool that sets a real one would put it here too.
    const name = claims?.email ?? claims?.username;
    return typeof name === 'string' && name.trim() ? name.trim() : null;
}

/**
 * Who to record as having made this write.
 *
 * **Never throws and never blocks a write.** Anything that goes wrong — a machine token with no
 * `openid` scope, a userInfo that is down, a pool that returns nothing — falls back to the claims
 * the token carries, which is exactly what was recorded before this existed.
 *
 * @param {object} req
 * @returns {Promise<string>}
 */
export async function actorFor(req) {
    const fallback = claimedActor(req);

    // A machine token carries a `client_id` and no person behind it. `userInfo` would refuse it for
    // want of the `openid` scope, so it is not asked.
    const sub = req.user?.sub;
    if (req.tokenKind !== 'user' || !sub) return fallback;

    const held = known.get(sub);
    if (held && held.until > Date.now()) return held.name ?? fallback;

    const token = bearerOf(req);
    if (!token) return fallback;

    try {
        const name = await askUserInfo(token);
        known.set(sub, { name, until: Date.now() + (name ? HOLD_MS : HOLD_FAILURE_MS) });
        return name ?? fallback;
    } catch (err) {
        // Logged once per failure window rather than per write, for the same reason it is cached.
        console.warn('Could not resolve who is calling; stamping the token claim instead', err.message);
        known.set(sub, { name: null, until: Date.now() + HOLD_FAILURE_MS });
        return fallback;
    }
}
