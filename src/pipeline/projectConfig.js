import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { serviceToken } from 'mlHelpers';
import fetch from 'node-fetch';

import config from '../config.js';

/** This service's own directory, so a relative local root does not depend on how it was launched. */
const serviceRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/**
 * The directory local storage uses, or null when uploads go to S3.
 *
 * Driven by `PIPELINE_STORAGE` (`'local'` or `'s3'`). The path is resolved against this service's
 * directory rather than `process.cwd()`: an IDE run configuration routinely sets a different
 * working directory, and files silently landing somewhere else is a confusing way to find that
 * out.
 *
 * An unrecognised `PIPELINE_STORAGE` is reported rather than quietly treated as S3 — a typo that
 * silently changes where a production upload goes is not a failure anyone should have to hunt.
 *
 * @returns {string|null} The absolute root, or null when storage is S3
 */
export function localStorageRoot() {
    const mode = String(config.PIPELINE_STORAGE || 's3').toLowerCase();
    if (mode === 's3') return null;
    if (mode !== 'local') {
        console.warn(`PIPELINE_STORAGE is "${config.PIPELINE_STORAGE}", which is neither `
            + '"local" nor "s3" — using S3.');
        return null;
    }
    return path.resolve(serviceRoot, config.PIPELINE_LOCAL_ROOT || '.pipeline-local');
}

/**
 * Project records read from fMam, which is where they actually live.
 *
 * Deliberately **not** the hardcoded `projectDetails` map in `controllers/fMamFetch.js`: that map
 * is a stale mirror of the `app_config.projects` collection and knows nothing about fields added
 * since it was written — storage among them.
 *
 * @namespace namespace:LabkoatApi.projectConfig
 */

const CACHE_MS = 60_000;

let cache = { at: 0, byName: new Map() };

/**
 * Fetch every project this service can see, keyed by project name.
 *
 * Cached briefly: a run uploads one file per request and each needs the bucket, so an uncached
 * read would be one fMam round trip per file. The window is short enough that a bucket changed in
 * the Admin page takes effect without a restart.
 *
 * @returns {Promise<Map<string, object>>} Project records by `project`
 */
async function loadProjects() {
    if (Date.now() - cache.at < CACHE_MS && cache.byName.size) return cache.byName;

    const bearerToken = await serviceToken.getToken();
    const res = await fetch(`${config.FMAM_URL}/project`, {
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${bearerToken}` },
    });
    if (!res.ok) throw new Error(`fMam returned ${res.status} listing projects`);

    // fMam's listProjects responds with the bare array, not the {data, errors, warnings} envelope.
    const projects = await res.json();
    const byName = new Map((Array.isArray(projects) ? projects : []).map((p) => [p.project, p]));
    cache = { at: Date.now(), byName };
    return byName;
}

/**
 * One project's record.
 *
 * @param {string} project - The project name
 * @returns {Promise<object|null>} The record, or null when there is no such project
 */
export async function getProjectConfig(project) {
    if (!project) return null;
    return (await loadProjects()).get(project) ?? null;
}

/**
 * Where a project's pipeline source files live.
 *
 * The layout is `<project>/<pipelineId>/<filename>`, identical whether the destination is S3 or a
 * local directory. The project segment is the Mongo database name and the pipeline segment is the
 * kebab-case id from the pipeline's own definition, so both are safe as key components with no
 * escaping — and the prefix is genuinely project-scoped, which is what makes a purge on project
 * delete bounded to that project.
 *
 * Omitting `pipelineId` yields the project root, which is what a purge wants.
 *
 * With `PIPELINE_STORAGE=local` — the `local` environment's default — files go to a directory on
 * this machine and fMam is not consulted at all, so the whole path works before any bucket, IAM
 * role or project record exists. It is checked first precisely because it is a development switch:
 * when it is on, it wins.
 *
 * Otherwise the bucket comes from the project record or, far more usually, from the master bucket
 * in config — never from the request, so a caller cannot name a bucket it should not write to.
 *
 * @param {string} project - The project name
 * @param {Object} [options]
 * @param {string|null} [options.pipelineId] - The pipeline the files belong to. Files uploaded
 *   without one — the ingest route — are grouped under `ingest`. Omit entirely for the project root
 * @returns {Promise<{kind: 'local'|'s3', root?: string, bucket?: string, region: string,
 *   prefix: string}|null>} The destination, or null when no bucket can be resolved
 */
export async function getProjectStorage(project, { pipelineId } = {}) {
    // `undefined` means "the project root"; an explicit null means "no pipeline", i.e. ingest.
    const prefix = pipelineId === undefined
        ? `${project}/`
        : `${project}/${pipelineId || 'ingest'}/`;

    const root = localStorageRoot();
    if (root) {
        return {
            kind: 'local', root, region: config.AWS_REGION, prefix,
        };
    }

    const record = await getProjectConfig(project).catch(() => null);
    const bucket = record?.storage?.bucket || config.PIPELINE_BUCKET;
    if (!bucket) return null;
    return {
        kind: 's3',
        bucket,
        region: record?.storage?.region || config.AWS_REGION,
        prefix,
    };
}

/** Drop the cache. Exposed for tests and for a deployment that needs to force a re-read. */
export function resetProjectCache() {
    cache = { at: 0, byName: new Map() };
}
