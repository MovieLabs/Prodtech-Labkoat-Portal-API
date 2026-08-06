/**
 * Credentials for pipelines that read a source needing one.
 *
 * Secrets come from AWS Secrets Manager at boot, with everything else this service reads, and are
 * held here so pipeline dispatch can reach them. They are **never** stored on a project record:
 * that would put a live credential in Mongo and send it to the browser with the project list.
 *
 * The mapping below is deliberately hardcoded. A pipeline declares the *name* of what it needs
 * (`secrets: ['yamdu']`) and this decides where that comes from, so a pipeline never learns which
 * secret store exists or how it is keyed. Adding a credential is a line here.
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
 * The credentials a pipeline declared, and nothing else.
 *
 * A name with no source, or a source that resolves to nothing, is reported rather than passed
 * through as undefined — the run would otherwise fail at the source with a 401 that says nothing
 * about which credential was missing.
 *
 * @param {Array<string>} [names] - The pipeline's declared `secrets`
 * @returns {{secrets: Object.<string, string>, missing: Array<string>}} What was resolved, and what
 *   could not be
 */
export function resolveSecrets(names = []) {
    const secrets = {};
    const missing = [];
    for (const name of names) {
        const value = SOURCES[name]?.(loaded);
        if (value) secrets[name] = value;
        else missing.push(name);
    }
    return { secrets, missing };
}
