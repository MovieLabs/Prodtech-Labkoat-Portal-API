import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';

import config from '../config.js';

import { updateRun } from './jobStore.js';
import { localStorageRoot } from './projectConfig.js';

/**
 * A bounded pool of worker threads running pipelines.
 *
 * Worker threads rather than a separate service, and rather than running in-process: each worker
 * is its own V8 isolate, so a pipeline chewing through a 79 MB PDF does not block the gateway's
 * event loop, `resourceLimits` bounds what a runaway parse can allocate — the worker dies, not the
 * pod — and `terminate()` gives real cancellation, which async work on the main thread cannot.
 *
 * @namespace namespace:LabkoatApi.workerPool
 */

const WORKER_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), 'runner.worker.js');

/** Runs accepted but not yet started, oldest first. */
const queue = [];

/** @type {Set<Worker>} */
const active = new Set();

/**
 * Start the next queued run, if there is one and there is room.
 */
function pump() {
    if (!queue.length || active.size >= config.PIPELINE_WORKER_COUNT) return;
    const job = queue.shift();

    // A run cancelled while it was still queued never starts.
    if (job.cancelled) {
        updateRun(job.runId, { status: 'cancelled' });
        pump();
        return;
    }

    const worker = new Worker(WORKER_PATH, {
        // The worker resolves `config` against its own `process.argv`, which is not the one the
        // service was started with, so anything environment-dependent is handed over explicitly.
        workerData: {
            request: job.request,
            region: job.region,
            localRoot: localStorageRoot(),
        },
        resourceLimits: { maxOldGenerationSizeMb: config.PIPELINE_WORKER_MEMORY_MB },
    });
    active.add(worker);

    let settled = false;
    const finish = (changes) => {
        if (settled) return;
        settled = true;
        updateRun(job.runId, changes);
        worker.terminate().catch(() => { /* already gone */ });
    };

    const timer = setTimeout(
        () => finish({ status: 'error', error: 'The pipeline run timed out' }),
        config.PIPELINE_RUN_TIMEOUT_MS,
    );

    updateRun(job.runId, {
        status: 'running',
        // Cancellation is a real kill, not a flag the run has to notice.
        cancel: () => finish({ status: 'cancelled' }),
    });

    worker.on('message', (message) => {
        if (message.type === 'progress') updateRun(job.runId, { progress: message.progress });
        if (message.type === 'done') finish({ status: 'done', result: message.result, progress: null });
        if (message.type === 'error') finish({ status: 'error', error: message.message });
    });

    worker.on('error', (err) => finish({ status: 'error', error: err?.message || String(err) }));

    worker.on('exit', () => {
        clearTimeout(timer);
        active.delete(worker);
        // A worker that exits without having reported anything died on its own — most often the
        // memory limit, which kills the thread rather than raising inside it.
        finish({ status: 'error', error: 'The pipeline worker stopped unexpectedly' });
        pump();
    });
}

/**
 * Queue a run.
 *
 * @param {Object} params
 * @param {string} params.runId
 * @param {object} params.request - The pipeline run request, as the pipeline will receive it
 * @param {string} params.region - AWS region the inputs live in
 */
export function submit({ runId, request, region }) {
    queue.push({
        runId, request, region, cancelled: false,
    });
    pump();
}

/**
 * Stop a run, whether it is queued or already in a worker.
 *
 * @param {object} run - The run record from the job store
 */
export function cancel(run) {
    const queued = queue.find((job) => job.runId === run.runId);
    if (queued) queued.cancelled = true;
    if (typeof run.cancel === 'function') run.cancel();
}

/** How many runs are executing and waiting. Exposed for a health endpoint. */
export const stats = () => ({ active: active.size, queued: queue.length });
