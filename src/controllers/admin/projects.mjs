import { fMamProxy } from '../fMamFetch.mjs';

export async function listProjects(req, res, next) {
    const route = req.route.path;
    console.log(`${req.method}: ${req.route.path}`);

    fMamProxy({
        res,
        req,
        next,
        method: 'GET',
        route,
        queryValidator: {},
    });
}
