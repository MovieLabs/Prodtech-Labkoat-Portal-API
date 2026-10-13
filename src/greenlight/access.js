import { actorFor } from '../auth/actor.js';
import config from '../config.js';

/**
 * Who may use the Greenlight submission routes, and which organisation's jobs they act on.
 *
 * **A group name is `<organisation>:<permission>,<permission>…`**, and a bare name is an
 * organisation with no permissions: `greenlight`, `labkoat:admin`, `labkoat:task.reshoot,task.task3`.
 *
 * **Greenlight organisations are the ones a machine client is configured for** in
 * `GREENLIGHT_CLIENTS`. Jobs belong to an organisation, not a person: anyone with a group in it sees
 * and approves every job posted for it, whoever posted it, and a member of any other organisation
 * sees none. A machine token carries no groups, so its organisation is the one its client id is
 * configured for. That is why these routes do not use `awsJwtValidator`, which admits any group
 * containing `labkoat` and nothing else.
 *
 * @namespace namespace:LabkoatApi.greenlightAccess
 */

/**
 * Split a group name into its organisation and permissions.
 *
 * @param {string} group - e.g. `labkoat:task.reshoot,task.task3`
 * @returns {{organisation: string, permissions: string[]}}
 */
export function parseGroup(group) {
    const [organisation, permissions = ''] = group.split(':');
    return { organisation, permissions: permissions.split(',').filter(Boolean) };
}

/**
 * The organisations Greenlight is enabled for.
 *
 * @returns {string[]}
 */
export function greenlightOrganisations() {
    return [...new Set(Object.values(config.GREENLIGHT_CLIENTS).map((client) => client.organisation))];
}

/**
 * A group name that opens the person routes: one whose organisation is a Greenlight organisation.
 *
 * @returns {RegExp} Matches nothing when no organisation is configured
 */
export function greenlightGroupPattern() {
    const names = greenlightOrganisations().map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    return names.length ? new RegExp(`^(?:${names.join('|')})(?::|$)`) : /$^/;
}

/**
 * The organisations whose jobs this caller may act on.
 *
 * @param {object} req - A request that has passed the token check
 * @returns {string[]} A machine client's one organisation, or each Greenlight organisation a person
 *   has a group in; empty for a caller with none
 */
export function organisationsOf(req) {
    if (req.tokenKind === 'machine') {
        const organisation = config.GREENLIGHT_CLIENTS[req.user?.client_id]?.organisation;
        return organisation ? [organisation] : [];
    }
    const enabled = greenlightOrganisations();
    const organisations = (req.user?.['cognito:groups'] ?? [])
        .map((group) => parseGroup(group).organisation)
        .filter((organisation) => enabled.includes(organisation));
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
