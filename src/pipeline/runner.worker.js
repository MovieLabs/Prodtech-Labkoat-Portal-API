import { parentPort, workerData } from 'node:worker_threads';

import { createContext, runPipeline } from 'data-pipeline';

import { readObject } from './storage.js';

/**
 * The worker that actually runs a pipeline.
 *
 * **`data-pipeline` is imported here and nowhere else in this service.** That is the point of the
 * worker: its dependency graph — pdfjs, exceljs, fast-xml-parser — is loaded into this isolate's
 * heap and never into the gateway's, and parsing a filming day's PDFs runs on this thread rather
 * than blocking auth and proxy traffic on the main one.
 *
 * The pipeline is handed a context whose `read` fetches from object storage. It never learns that
 * the bytes came from S3, which is why the same pipeline also runs from the CLI over a directory.
 *
 * @namespace namespace:LabkoatApi.runnerWorker
 */

// Everything the worker needs is handed to it: a worker thread has its own `process.argv`, so
// `config` here would resolve to the default environment rather than the one the service was
// started in. Configuration is passed, never re-derived.
const { request, region, localRoot } = workerData;

/**
 * @param {object} message
 */
const post = (message) => parentPort.postMessage(message);

async function main() {
    const context = createContext({
        read: (input) => readObject({ url: input.ref, region, localRoot }),
        onProgress: (progress) => post({ type: 'progress', progress }),
        options: request.omcOptions,
    });

    const result = await runPipeline(request, context);
    post({ type: 'done', result });
}

main().catch((err) => {
    // The worker owns reporting its own failure: an uncaught throw here would surface to the pool
    // as a bare non-zero exit code with nothing to tell the user.
    post({ type: 'error', message: err?.message || String(err) });
});
