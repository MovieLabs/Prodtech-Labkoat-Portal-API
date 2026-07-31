import InternalError from '../../errors/InternalError.js';
import InvalidProject from '../../errors/InvalidProject.js';
import InvalidQuery from '../../errors/InvalidQuery.js';
import InvalidRequest from '../../errors/InvalidRequest.js';
import mintAssetPair from '../../pipeline/assetIdentity.js';
import {
    createRun, getRun, publicView,
} from '../../pipeline/jobStore.js';
import { getProjectConfig, getProjectStorage } from '../../pipeline/projectConfig.js';
import { receiveUpload, writeSidecar } from '../../pipeline/storage.js';
import { submit } from '../../pipeline/workerPool.js';

/**
 * Handlers for `/api/ingest/v1`.
 *
 * Asset ingest keeps its own route namespace — the contract in the Portal's `Ingest/CONTRACTS.md`
 * is already built against — but it runs over the **same** storage, job-store and worker modules as
 * `/api/pipeline/v1`. There is one upload implementation and one job store; only the two contracts
 * differ, and only where they genuinely mean different things.
 *
 * What ingest adds is identity: it mints the `Asset` / `AssetStructure` pair from the file's hash
 * and links them, which the pipeline routes have no business doing.
 *
 * @namespace namespace:LabkoatApi.ingestController
 */

const ok = (res, data) => res.status(200).json({ data, errors: null, warnings: null }).end();

/**
 * Store one file and return the identified, linked OMC pair for it.
 *
 * The identifier scope is taken from the project record, not from the request: the client sends
 * one for the mock's benefit, and trusting it would let a caller mint identifiers at any scope.
 */
export async function uploadAsset(req, res, next) {
    let refusal = null;
    let project = null;
    let destination = null;
    try {
        // Read from the fields busboy has already seen, which is why the client appends `project`
        // and `omc` before the file; the query string is accepted as well.
        const { fields, file } = await receiveUpload({
            req,
            resolveDestination: async (seen) => {
                project = req.query.project || seen.project;
                if (!project) {
                    refusal = new InvalidRequest('missing: project');
                    return null;
                }
                // An explicit null pipeline: files arriving this way belong to no pipeline, and are
                // grouped under `<project>/ingest/`. Omitting the option entirely would ask for the
                // project root, which is the purge prefix rather than a place to write.
                destination = await getProjectStorage(project, { pipelineId: null });
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
            next(new InvalidRequest('no file in the request'));
            return;
        }
        // Identity is derived from the project's own scope and schema version, so a record that
        // cannot be read is a refusal rather than something to mint around. The client sends an
        // identifierScope too, but trusting it would let a caller mint at any scope it liked.
        const record = await getProjectConfig(project).catch(() => null);
        if (!record?.primaryScope || !record?.schemaVersion) {
            next(new InvalidProject(
                `${project} has no primaryScope or schemaVersion on its record, so asset `
                + 'identifiers cannot be minted',
            ));
            return;
        }

        let supplied = {};
        if (fields.omc) {
            try {
                supplied = JSON.parse(fields.omc);
            } catch {
                next(new InvalidRequest('the omc field is not valid JSON'));
                return;
            }
        }

        const omc = await mintAssetPair({
            asset: supplied.asset,
            assetStructure: supplied.assetStructure,
            md5: file.md5,
            identifierScope: record.primaryScope,
            schemaVersion: record.schemaVersion,
            storageUrl: file.ref,
        });

        // The sidecar the ingest contract specifies, carrying the minted pair alongside the file's
        // own facts. It can only be written after the upload: it holds the identifiers and the
        // reference, neither of which exists before the bytes land.
        const sidecar = await writeSidecar({
            destination, file, project, omc,
        });

        ok(res, {
            md5: file.md5,
            storageUrl: file.ref,
            size: file.size,
            contentType: file.contentType,
            fileName: file.fileName,
            replaced: file.replaced,
            changed: file.changed,
            omc,
            sidecar: { fileName: `${file.fileName}.omc.json`, content: sidecar },
        });
    } catch (err) {
        next(err.status ? err : new InternalError(err.message));
    }
}

/**
 * Mine OMC from the contents of already-uploaded assets.
 *
 * This is a pipeline run in everything but name, so it is one: the same job store, the same worker
 * pool. The pipeline is chosen by `pipelineId` when the caller names one, which is how a supplier
 * delivery uploaded through ingest can be processed by the adapter that understands it.
 */
export async function startProcessing(req, res, next) {
    try {
        const { project, assets, pipelineId } = req.body ?? {};
        if (!project) {
            next(new InvalidRequest('missing: project'));
            return;
        }
        if (!pipelineId) {
            // Content extraction with no pipeline named has nothing to run. Answering with a
            // finished, empty job keeps the client's contract intact and says so plainly, rather
            // than failing a request that is not malformed.
            const empty = createRun({ pipelineId: null, project });
            empty.status = 'done';
            empty.result = { omc: [], notes: [], report: null };
            empty.finishedAt = Date.now();
            ok(res, { jobId: empty.runId });
            return;
        }

        // Only the region is wanted here — each asset carries its own storage reference.
        const destination = await getProjectStorage(project, { pipelineId });
        if (!destination) {
            next(new InvalidProject(`${project} has no storage bucket configured`));
            return;
        }

        const record = await getProjectConfig(project);
        const run = createRun({ pipelineId, project });
        submit({
            runId: run.runId,
            region: destination.region,
            request: {
                pipelineId,
                inputs: (assets ?? []).map((a) => ({
                    role: a.role,
                    fileName: a.fileName,
                    ref: a.storageUrl,
                    contentType: a.contentType,
                    md5: a.md5,
                })),
                options: {},
                omcOptions: {
                    ...(record?.primaryScope ? { identifierScope: record.primaryScope } : {}),
                    ...(record?.schemaVersion ? { schemaVersion: record.schemaVersion } : {}),
                },
            },
        });
        ok(res, { jobId: run.runId });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/**
 * Poll a processing job.
 *
 * Ingest's status vocabulary is `pending | done | error`, narrower than the pipeline routes'; the
 * shared run record is translated rather than leaked, so the built client keeps working.
 */
export async function getProcessingResult(req, res, next) {
    const run = getRun(req.params.jobId);
    if (!run) {
        next(new InvalidQuery(`no job "${req.params.jobId}"`));
        return;
    }
    const view = publicView(run);
    if (view.status === 'done') {
        ok(res, { status: 'done', omc: view.omc ?? [] });
        return;
    }
    if (view.status === 'error' || view.status === 'cancelled') {
        ok(res, { status: 'error', details: view.details || 'The job was cancelled' });
        return;
    }
    ok(res, { status: 'pending' });
}
