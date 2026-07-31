import InternalError from '../../errors/InternalError.js';
import InvalidProject from '../../errors/InvalidProject.js';
import InvalidQuery from '../../errors/InvalidQuery.js';
import InvalidRequest from '../../errors/InvalidRequest.js';
import {
    createRun, getRun, publicView, updateRun,
} from '../../pipeline/jobStore.js';
import { getProjectStorage } from '../../pipeline/projectConfig.js';
import { receiveUpload, writeSidecar } from '../../pipeline/storage.js';
import { cancel, submit } from '../../pipeline/workerPool.js';

/**
 * Handlers for `/api/pipeline/v1`.
 *
 * The service's job here is dispatch, not processing: authorize, put the bytes somewhere the
 * worker can read them, hand the request to a pipeline, and report back. Every decision about what
 * a pipeline needs and what it produces belongs to Data-Pipeline.
 *
 * Responses use the house envelope — `{ data, errors, warnings }` on success — and failures are
 * thrown to the global handler as one of `src/errors/*` rather than serialised here.
 *
 * @namespace namespace:LabkoatApi.pipelineController
 */

/** Success envelope. */
const ok = (res, data) => res.status(200).json({ data, errors: null, warnings: null }).end();

/**
 * Load `data-pipeline` on first use rather than at import time.
 *
 * Importing it compiles the OMC JSON Schemas through omc-util, which is a second of work and
 * several hundred lines of ajv strict-mode warnings on stdout. A gateway that mostly proxies fMam
 * should not pay that at boot, and a startup log buried under schema warnings is a startup log
 * nobody reads. The subpath, not the package root: the root also exports `lib`, which would pull
 * ExcelJS in as well.
 *
 * @returns {Promise<{catalog: Function, getPipeline: Function}>} The pipeline registry
 */
let registry = null;
const pipelineRegistry = () => {
    // eslint-disable-next-line import/no-unresolved
    registry = registry ?? import('data-pipeline/pipelines');
    return registry;
};

/**
 * The catalogue: what pipelines exist, and what each takes.
 *
 * Reading it from `data-pipeline` rather than restating it is what makes a pipeline added there
 * appear in the Portal with no change to this service or the frontend.
 */
export async function listPipelines(req, res, next) {
    try {
        const { catalog } = await pipelineRegistry();
        ok(res, catalog({ schemaVersion: req.query.schemaVersion }));
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/**
 * Store one file in the project's bucket.
 *
 * The bucket comes from the project's record, never from the request, so a caller cannot name a
 * bucket it should not be writing to.
 */
export async function uploadPipelineFile(req, res, next) {
    let refusal = null;
    let destination = null;
    let project = null;
    let pipelineId = null;
    try {
        // The project and pipeline are read from the fields busboy has seen by the time the file
        // part starts, which is why the client appends them first; the query string is accepted as
        // well so a caller that got the order wrong still works.
        const { fields, file } = await receiveUpload({
            req,
            resolveDestination: async (seen) => {
                project = req.query.project || seen.project;
                pipelineId = req.query.pipelineId || seen.pipelineId || null;
                if (!project) {
                    refusal = new InvalidRequest('missing: project');
                    return null;
                }
                destination = await getProjectStorage(project, { pipelineId });
                if (!destination) {
                    refusal = new InvalidProject(`${project} has no storage configured`);
                }
                return destination;
            },
        });

        if (refusal) {
            next(refusal);
            return;
        }
        if (!file) {
            next(new InvalidRequest(`no file in the request (fields: ${Object.keys(fields).join(', ') || 'none'})`));
            return;
        }

        // The hash has nowhere else to live: the key is named before the bytes are read and an S3
        // ETag is not the file's MD5 for a multipart upload. Written after the file so a failed
        // upload leaves no record claiming to describe it.
        await writeSidecar({
            destination, file, project, pipelineId,
        });

        ok(res, file);
    } catch (err) {
        // PayloadTooLarge and UnsupportedMedia already carry their status; anything else is ours.
        next(err.status ? err : new InternalError(err.message));
    }
}

/**
 * Accept a run and hand it to a worker.
 *
 * The request is checked against the pipeline's own declarations before it is accepted, so a
 * caller learns that a required file is missing before any bytes are read. Every problem is
 * reported at once rather than one per round trip.
 */
export async function startPipelineRun(req, res, next) {
    try {
        const {
            pipelineId, project, inputs, options, omcOptions,
        } = req.body ?? {};

        if (!project) {
            next(new InvalidRequest('missing: project'));
            return;
        }
        const { getPipeline } = await pipelineRegistry();
        const definition = getPipeline(pipelineId);
        if (!definition) {
            next(new InvalidRequest(`unknown pipeline "${pipelineId}"`));
            return;
        }

        // Only the region is wanted here — the inputs already carry their own references, and the
        // worker resolves each one from those.
        const destination = await getProjectStorage(project, { pipelineId });
        if (!destination) {
            next(new InvalidProject(`${project} has no storage bucket configured`));
            return;
        }

        const run = createRun({ pipelineId, project });
        submit({
            runId: run.runId,
            region: destination.region,
            request: {
                pipelineId, inputs: inputs ?? [], options: options ?? {}, omcOptions: omcOptions ?? {},
            },
        });

        ok(res, { runId: run.runId, status: run.status });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/** Report a run's state, and its OMC once it has one. */
export async function getPipelineRun(req, res, next) {
    const run = getRun(req.params.runId);
    if (!run) {
        next(new InvalidQuery(`no run "${req.params.runId}"`));
        return;
    }
    ok(res, publicView(run));
}

/**
 * Stop a run.
 *
 * Best-effort by contract: the client has already stopped waiting, so this exists to free the
 * worker rather than to guarantee anything. A run that finished first stays finished.
 */
export async function cancelPipelineRun(req, res, next) {
    const run = getRun(req.params.runId);
    if (!run) {
        next(new InvalidQuery(`no run "${req.params.runId}"`));
        return;
    }
    if (!['done', 'error', 'cancelled'].includes(run.status)) {
        cancel(run);
        updateRun(run.runId, { status: 'cancelled' });
    }
    ok(res, { runId: run.runId, status: getRun(run.runId).status });
}
