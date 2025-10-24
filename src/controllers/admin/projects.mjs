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

export async function updateProject(req, res, next) {
    const route = req.route.path;
    console.log(`${req.method}: ${req.route.path}`);
    console.log(req.body);

    fMamProxy({
        res,
        req,
        next,
        method: 'PATCH',
        route,
        queryValidator: {},
    });
}

export async function createProject(req, res, next) {
    const route = req.route.path;
    console.log(`${req.method}: ${req.route.path}`);

    fMamProxy({
        res,
        req,
        next,
        method: 'POST',
        route,
        queryValidator: {},
    });
}

export async function removeProject(req, res, next) {
    const route = req.route.path;
    console.log(`${req.method}: ${req.route.path}`);

    fMamProxy({
        res,
        req,
        next,
        method: 'DELETE',
        route,
        queryValidator: {},
    });
}
