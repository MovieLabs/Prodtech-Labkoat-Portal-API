import crypto from 'node:crypto';

import config from '../config.js';

/**
 * In-memory record of pipeline runs.
 *
 * **Runs are disposable.** A run is dead once its OMC has reached the Portal's Staging model, so
 * nothing is persisted, there is no history, and a restart loses whatever was in flight. That is a
 * deliberate choice for the proof-of-concept rather than an omission.
 *
 * The consequence a deployment must respect: `POST /run` and `GET /run/:runId` have to reach the
 * same process. These routes are only correct on a **single replica** — with more than one, a poll
 * can land on a process that never saw the run and will answer 404. Pin the replica count or use
 * session affinity at the ingress.
 *
 * @namespace namespace:LabkoatApi.jobStore
 */

/** @type {Map<string, object>} */
const runs = new Map();

/**
 * Drop runs that finished long enough ago that nobody is coming back for them. Called on every
 * write, so there is no timer to leak and an idle process does no work.
 */
function sweep() {
    const cutoff = Date.now() - config.PIPELINE_RUN_TTL_MS;
    for (const [runId, run] of runs) {
        if (run.finishedAt && run.finishedAt < cutoff) runs.delete(runId);
    }
}

/**
 * Record a newly accepted run.
 *
 * @param {Object} params
 * @param {string} params.pipelineId
 * @param {string} params.project
 * @returns {object} The run record
 */
export function createRun({ pipelineId, project }) {
    sweep();
    const runId = crypto.randomUUID();
    const run = {
        runId,
        pipelineId,
        project,
        status: 'queued',
        progress: null,
        startedAt: Date.now(),
        finishedAt: null,
        result: null,
        error: null,
        cancel: null, // Set by the pool once a worker is actually running this
    };
    runs.set(runId, run);
    return run;
}

/**
 * @param {string} runId
 * @returns {object|null}
 */
export function getRun(runId) {
    return runs.get(runId) ?? null;
}

/**
 * Merge changes into a run, stamping `finishedAt` when it reaches a terminal state.
 *
 * @param {string} runId
 * @param {object} changes
 * @returns {object|null} The updated run
 */
export function updateRun(runId, changes) {
    const run = runs.get(runId);
    if (!run) return null;
    Object.assign(run, changes);
    if (['done', 'error', 'cancelled'].includes(run.status) && !run.finishedAt) {
        run.finishedAt = Date.now();
    }
    sweep();
    return run;
}

/**
 * What a caller is told about a run. The internal `cancel` handle and the timestamps used for
 * sweeping are not part of the contract, so they are not sent.
 *
 * @param {object} run
 * @returns {object} The public view
 */
export function publicView(run) {
    const view = {
        runId: run.runId,
        pipelineId: run.pipelineId,
        status: run.status,
    };
    if (run.status === 'running' && run.progress) view.progress = run.progress;
    if (run.status === 'done' && run.result) {
        view.omc = run.result.omc ?? [];
        view.notes = run.result.notes ?? [];
        view.report = run.result.report ?? null;
    }
    if (run.status === 'error') view.details = run.error ?? 'The pipeline run failed';
    return view;
}
