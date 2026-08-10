import InternalError from '../../errors/InternalError.js';
import InvalidRequest from '../../errors/InvalidRequest.js';
import { fMamRequest } from '../fMamFetch.js';

/**
 * Handlers for `/api/admin/mappingTemplate`.
 *
 * A mapping template says how a sheet of source data becomes OMC. It is authored in the Portal's
 * mapping canvas and executed by `omcMapping` — in the browser for a preview, in a pipeline worker
 * for a run. Storing them is what makes that configuration rather than something rebuilt by hand.
 *
 * Strictly simpler than `projects.js`: a template touches no per-project database, so there is no
 * project cache to invalidate and no object storage to purge. This is proxying with an envelope.
 *
 * @namespace namespace:LabkoatApi.templateController
 */

/** Success envelope. */
const ok = (res, data) => res.status(200).json({ data, errors: null, warnings: null }).end();

/**
 * Pass a template request to fMam and wrap what comes back.
 *
 * `fMamRequest` rather than `fMamProxy`, even for the list: proxying commits fMam's own response
 * verbatim, and fMam's project list answers with a bare array. Templates answer in the house
 * envelope, and going through here keeps that true whatever fMam does later.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req
 * @param {import('express').Response} params.res
 * @param {Function} params.next
 * @param {string} params.method
 */
async function forward({
    req, res, next, method,
}) {
    const { status, payload } = await fMamRequest({
        method, route: '/mappingTemplate', query: req.query, body: req.body,
    });
    if (status < 200 || status >= 300) {
        next(new InternalError(
            `fMam rejected the mapping template request (${status}): `
            + `${payload?.error?.details ?? payload?.errors?.[0]?.detail ?? 'no detail'}`,
        ));
        return;
    }
    // fMam already answers in the envelope, so unwrap rather than nesting one inside another.
    ok(res, payload?.data ?? payload);
}

/** List templates for a project — including the global ones — or fetch one by `?id=`. */
export async function listMappingTemplates(req, res, next) {
    try {
        await forward({
            req, res, next, method: 'GET',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/**
 * Create or replace a template.
 *
 * The id is minted by the client, as it is for a project. Refused here when absent rather than
 * letting Mongo upsert a document with no key it can be found by again.
 */
export async function saveMappingTemplate(req, res, next) {
    try {
        if (!req.body?.id) {
            next(new InvalidRequest('missing: id'));
            return;
        }
        await forward({
            req, res, next, method: req.method === 'POST' ? 'POST' : 'PATCH',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/** Remove a template by `?id=`. Nothing cascades. */
export async function removeMappingTemplate(req, res, next) {
    try {
        if (!req.query?.id) {
            next(new InvalidRequest('missing: id'));
            return;
        }
        await forward({
            req, res, next, method: 'DELETE',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}
