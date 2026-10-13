import { actorFor } from '../auth/actor.js';
import config from '../config.js';

/**
 * Who may use the Greenlight submission routes, and which organisation's jobs they act on.
 *
 * **`greenlight` is the gate, not the organisation.** A person needs a group named `greenlight`, or
 * `<organisation>:greenlight` — `labkoat:greenlight`, `konsol:greenlight` — so other organisations
 * can be let in without being made members of Labkoat. That is why these routes do not use
 * `awsJwtValidator`, which admits any group containing `labkoat` and nothing else.
 *
 * **Jobs belong to an organisation, not a person.** Anyone in `konsol:greenlight` sees and approves
 * every job posted for `konsol`, whoever posted it. A machine client (client_credentials, with the
 * `GREENLIGHT_SCOPE` scope) carries no groups, so its organisation is looked up in
 * `GREENLIGHT_CLIENTS` by its client id.
 *
 * @namespace namespace:LabkoatApi.greenlightAccess
 */

/** A group name that opens the Greenlight routes; the first capture is its organisation. */
export const GREENLIGHT_GROUP = /^(?:([^:]+):)?greenlight$/;

/** The organisation a bare `greenlight` group belongs to. */
export const DEFAULT_ORGANISATION = 'labkoat';

/**
 * The organisations whose jobs this caller may act on.
 *
 * @param {object} req - A request that has passed the token check
 * @returns {string[]} A machine client's one organisation, or each one a person has a greenlight
 *   group in; empty for a caller with none
 */
export function organisationsOf(req) {
    if (req.tokenKind === 'machine') {
        const organisation = config.GREENLIGHT_CLIENTS[req.user?.client_id]?.organisation;
        return organisation ? [organisation] : [];
    }
    const organisations = (req.user?.['cognito:groups'] ?? [])
        .map((group) => GREENLIGHT_GROUP.exec(group))
        .filter(Boolean)
        .map(([, organisation]) => organisation ?? DEFAULT_ORGANISATION);
    return [...new Set(organisations)];
}

/**
 * Who posted or approved a job, as the Portal shows it: a machine client's configured name, or the
 * person's email where Cognito will say it.
 *
 * @param {object} req - A request that has passed the token check
 * @returns {Promise<string>}
 */
export async function callerName(req) {
    if (req.tokenKind === 'machine') {
        return config.GREENLIGHT_CLIENTS[req.user?.client_id]?.name ?? req.user?.client_id ?? 'service';
    }
    return actorFor(req);
}
