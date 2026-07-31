import InternalError from '../../errors/InternalError.js';
import InvalidRequest from '../../errors/InvalidRequest.js';
import { getProjectStorage, resetProjectCache } from '../../pipeline/projectConfig.js';
import { purgePrefix } from '../../pipeline/storage.js';
import { fMamProxy, fMamRequest } from '../fMamFetch.js';

/**
 * Destroy a project's data in fMam and then its stored files, reporting what actually happened.
 *
 * The ordering is deliberate at three points:
 *
 * 1. **Storage is resolved first.** After a delete the project record is gone, and the bucket is
 *    resolved from that record — ask afterwards and there is nothing left to ask. The request body
 *    carries a `storage` block too, but a bucket to purge is not something to take from a client.
 * 2. **fMam goes next, and a failure stops everything.** Files are never destroyed for a project
 *    whose data could not be dropped; the caller can retry with nothing lost.
 * 3. **The purge is last, and its failure is a warning rather than an error.** The project is
 *    already gone by then, so reporting a failure would be describing an operation that largely
 *    succeeded. Files left behind are the lifecycle rule's problem, and saying so is more useful
 *    than a 500 that implies nothing happened.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req
 * @param {import('express').Response} params.res
 * @param {Function} params.next
 * @param {string} params.route - fMam route: `/project` or `/reset`
 * @param {string} params.action - Named in messages, e.g. `deleted`
 */
async function destroyProject({
    req, res, next, route, action,
}) {
    const { project } = req.body ?? {};
    if (!project) {
        next(new InvalidRequest('missing: project'));
        return;
    }

    // Resolved while the record still exists. A project with no storage is not an error — it may
    // simply never have had a file uploaded.
    const destination = await getProjectStorage(project).catch(() => null);

    const { status, payload } = await fMamRequest({
        method: 'DELETE', route, query: req.query, body: req.body,
    });
    if (status < 200 || status >= 300) {
        next(new InternalError(
            `fMam refused to ${action} ${project} (${status}): ${payload?.error?.details ?? 'no detail'}`,
        ));
        return;
    }

    // The project list is cached for a minute; without this an upload to a project that no longer
    // exists still resolves a destination and succeeds.
    resetProjectCache();

    const warnings = [];
    if (destination) {
        try {
            const { deleted, errors } = await purgePrefix({ destination });
            console.log(`${action} ${project}: purged ${deleted} object(s) from ${destination.prefix}`);
            if (errors.length) {
                warnings.push({
                    title: 'Some stored files could not be deleted',
                    details: `${errors.length} object(s) under ${destination.prefix} remain: ${
                        errors.slice(0, 3).map((e) => e.key).join(', ')}`,
                });
            }
        } catch (err) {
            warnings.push({
                title: 'Stored files could not be deleted',
                details: `${project} was ${action}, but its files under ${destination.prefix} `
                    + `remain: ${err.message}`,
            });
        }
    }

    res.status(200)
        .json({ data: payload, errors: null, warnings: warnings.length ? warnings : null })
        .end();
}

export async function listProjects(req, res, next) {
    const route = req.route.path;

    fMamProxy({
        res,
        req,
        next,
        method: 'GET',
        route,
        queryValidator: {},
    });
}

/**
 * Write a project record and drop the cached copy of the project list.
 *
 * Without the invalidation a project created here is invisible to uploads for up to a minute, and
 * a storage bucket edited here keeps writing to the old one for just as long.
 *
 * @param {Object} params
 * @param {import('express').Request} params.req
 * @param {import('express').Response} params.res
 * @param {Function} params.next
 * @param {string} params.method - POST to create, PATCH to update
 */
async function writeProject({
    req, res, next, method,
}) {
    const { status, payload } = await fMamRequest({
        method, route: '/project', query: req.query, body: req.body,
    });
    if (status < 200 || status >= 300) {
        next(new InternalError(
            `fMam rejected the project write (${status}): ${payload?.error?.details ?? 'no detail'}`,
        ));
        return;
    }
    resetProjectCache();
    res.status(200).json({ data: payload, errors: null, warnings: null }).end();
}

export async function updateProject(req, res, next) {
    try {
        await writeProject({
            req, res, next, method: 'PATCH',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

export async function createProject(req, res, next) {
    try {
        await writeProject({
            req, res, next, method: 'POST',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/** Remove a project entirely: its database, its record, and every file stored for it. */
export async function removeProject(req, res, next) {
    try {
        await destroyProject({
            req, res, next, route: '/project', action: 'deleted',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}

/**
 * Clear a project's data but keep the project.
 *
 * Uploaded source files are project data, so they go too — and they go the same way, purged rather
 * than left as recoverable versions. One code path with delete, so there is no question about what
 * survives which operation.
 */
export async function resetProject(req, res, next) {
    try {
        await destroyProject({
            req, res, next, route: '/reset', action: 'reset',
        });
    } catch (err) {
        next(new InternalError(err.message));
    }
}
