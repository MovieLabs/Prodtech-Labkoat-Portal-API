/**
 * Credentials for pipelines that read a source needing one.
 *
 * A pipeline declares the *name* of what it needs (`secrets: ['yamdu']`) and this decides where
 * that comes from, so a pipeline never learns which secret store exists or how it is keyed.
 *
 * There are two kinds of source, and the difference is who the credential belongs to:
 *
 * - **Service-owned** ({@link SOURCES}) — a token this service holds on everyone's behalf, read
 *   from AWS Secrets Manager at boot with everything else. They are **never** stored on a project
 *   record: that would put a live credential in Mongo and send it to the browser with the project
 *   list. Adding one is a line in `SOURCES`.
 * - **User-supplied** ({@link USER_SUPPLIED}) — a credential that belongs to the person running the
 *   pipeline, obtained by them logging in to the source and sent with the run request. Frame.io
 *   works this way: its V4 API authenticates through Adobe IMS, so there is no service token to
 *   hold, and each user sees what their own Frame.io account can see.
 *
 * A user-supplied credential is **never persisted**. It is not written to the job store, does not
 * appear in `publicView`, and dies with the worker that used it — which is the same lifetime the
 * rest of a pipeline run already has.
 *
 * A run is given only the names its pipeline declared. The alternative — handing the worker
 * everything — would put the Okta client secret and the Neo4j password in the same object as a
 * third-party API token, for no reason.
 *
 * @namespace namespace:LabkoatApi.pipelineSecrets
 */

/**
 * Pipeline secret name to where it is found in the boot-time secrets.
 *
 * @type {Object.<string, function(Object): (string|undefined)>}
 */
const SOURCES = {
    yamdu: (secrets) => secrets?.LABKOAT?.YAMDU_API_TOKEN,
};

/**
 * Pipeline secret names the caller supplies per run, and the provider a client must log in to in
 * order to obtain one.
 *
 * The provider name is what the Portal keys its login implementation on, so a pipeline needing a
 * credential this service cannot mint is offered with a "connect" step and no frontend change is
 * needed to name it.
 *
 * @type {Object.<string, string>}
 */
const USER_SUPPLIED = {
    frameio: 'frameio',
};

let loaded = null;

/**
 * Hold the secrets read at boot. Called once from `apiServer()`.
 *
 * @param {Object} secrets - As returned by `awsSecrets`, keyed by ARN name
 */
export function setPipelineSecrets(secrets) {
    loaded = secrets;
}

/**
 * Describe the credentials a pipeline needs, and where each has to come from.
 *
 * This is what lets a client render a connect step for a pipeline it has never seen — the same way
 * it already renders file roles and options from the pipeline's own declaration — rather than
 * carrying a list of which pipelines need a login.
 *
 * @param {Array<string>} [names] - The pipeline's declared `secrets`
 * @returns {Array<{name: string, source: ('service'|'user'), provider: (string|null)}>} One entry
 *   per declared credential
 */
export function credentialsFor(names = []) {
    return names.map((name) => (USER_SUPPLIED[name]
        ? { name, source: 'user', provider: USER_SUPPLIED[name] }
        : { name, source: 'service', provider: null }));
}

/**
 * The credentials a pipeline declared, and nothing else.
 *
 * A name with no source, or a source that resolves to nothing, is reported rather than passed
 * through as undefined — the run would otherwise fail at the source with a 401 that says nothing
 * about which credential was missing.
 *
 * A user-supplied name is only ever taken from `provided`. It deliberately does **not** fall back
 * to the service's own secrets: a name that means "the user's own credential" must not silently
 * become "everyone shares this one".
 *
 * @param {Array<string>} [names] - The pipeline's declared `secrets`
 * @param {Object.<string, string>} [provided] - Credentials sent with the run request
 * @returns {{secrets: Object.<string, string>, missing: Array<string>,
 *   missingUser: Array<string>}} What was resolved, what could not be, and which of those the
 *   caller was meant to supply
 */
export function resolveSecrets(names = [], provided = {}) {
    const secrets = {};
    const missing = [];
    const missingUser = [];
    for (const name of names) {
        const value = USER_SUPPLIED[name] ? provided?.[name] : SOURCES[name]?.(loaded);
        if (value) {
            secrets[name] = value;
        } else {
            missing.push(name);
            if (USER_SUPPLIED[name]) missingUser.push(name);
        }
    }
    return { secrets, missing, missingUser };
}
