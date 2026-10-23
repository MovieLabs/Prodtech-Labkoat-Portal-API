import InternalError from '../errors/InternalError.js';
import InvalidRequest from '../errors/InvalidRequest.js';

import { fMamRequest } from './fMamFetch.js';

/**
 * Handlers for saved templates, passed to fMam's config database and wrapped in the house envelope.
 *
 * @namespace namespace:LabkoatApi.templateController
 */

/** Success envelope. */
const ok = (res, data) => res.status(200).json({ data, errors: null, warnings: null }).end();

/**
 * The handlers for one fMam template route.
 *
 * `fMamRequest` rather than `fMamProxy`, so the answer is always re-wrapped in this envelope.
 *
 * @param {string} route - fMam's route, e.g. '/template'
 * @returns {{list: Function, save: Function, remove: Function}}
 */
export function templateHandlers(route) {
    /**
     * Pass the request to fMam and answer with what it returns.
     *
     * @param {import('express').Request} req
     * @param {import('express').Response} res
     * @param {Function} next
     * @param {object} [body]
     */
    async function forward(req, res, next, body) {
        const { status, payload } = await fMamRequest({
            method: req.method, route, query: req.query, body,
        });
        if (status < 200 || status >= 300) {
            next(new InternalError(
                `fMam rejected the template request (${status}): `
                + `${payload?.error?.details ?? payload?.errors?.[0]?.detail ?? 'no detail'}`,
            ));
            return;
        }
        ok(res, payload?.data ?? payload);
    }

    /** List templates by `?kind=&project=`, or fetch one by `?id=`. */
    async function list(req, res, next) {
        try {
            await forward(req, res, next);
        } catch (err) {
            next(new InternalError(err.message));
        }
    }

    /** Create or replace a template; the caller is recorded as its creator when it is new. */
    async function save(req, res, next) {
        try {
            if (!req.body?.id) {
                next(new InvalidRequest('missing: id'));
                return;
            }
            await forward(req, res, next, { ...req.body, createdBy: req.user?.sub ?? null });
        } catch (err) {
            next(new InternalError(err.message));
        }
    }

    /** Delete a template by `?id=`. */
    async function remove(req, res, next) {
        try {
            if (!req.query?.id) {
                next(new InvalidRequest('missing: id'));
                return;
            }
            await forward(req, res, next);
        } catch (err) {
            next(new InternalError(err.message));
        }
    }

    return { list, save, remove };
}
