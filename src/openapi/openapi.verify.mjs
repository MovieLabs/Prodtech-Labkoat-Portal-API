/**
 * Runnable check that the spec describes the routes the service actually serves.
 *
 * `node src/openapi/openapi.verify.mjs`
 *
 * A spec drifts the moment somebody adds a route and forgets it, and the drift is invisible — the
 * service works, the docs are simply wrong about it, and nobody finds out until a consumer builds a
 * client from them. So the router is read as text and compared against the spec, both ways:
 *
 * - a route the router serves and the spec does not describe
 * - a path the spec describes and the router does not serve
 *
 * It reads the router with a regular expression rather than importing it, because importing pulls
 * in the database and the token validators. That is a fair trade for a check that has to run
 * anywhere, and the pattern only has to recognise `router.method('path'` — the shape every route in
 * that file is written in.
 *
 * Throws on failure; prints a summary on success. There is no test runner in this repo.
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import YAML from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const MOUNT = '/api/vocab/v1';

const spec = YAML.parse(readFileSync(join(here, 'openapi.yaml'), 'utf8'));
const router = readFileSync(join(here, '..', 'routes', 'vocab-v1-router.js'), 'utf8');

const METHODS = ['get', 'post', 'put', 'delete', 'patch'];

/** `/terms/:id` in the router is `/terms/{id}` in the spec. */
const asSpecPath = ((path) => MOUNT + path.replace(/:([A-Za-z0-9_]+)/g, '{$1}'));

// ---- what the router serves ----

const served = new Set();
const pattern = /router\.(get|post|put|delete|patch)\(\s*'([^']+)'/g;
let match = pattern.exec(router);
while (match) {
    served.add(`${match[1].toUpperCase()} ${asSpecPath(match[2])}`);
    match = pattern.exec(router);
}

// ---- what the spec describes ----

const described = new Set();
Object.entries(spec.paths ?? {}).forEach(([path, operations]) => {
    Object.keys(operations)
        .filter((key) => METHODS.includes(key))
        .forEach((method) => described.add(`${method.toUpperCase()} ${path}`));
});

// ---- compare, both ways ----

const undocumented = [...served].filter((route) => !described.has(route)).sort();
// Only routes under this router's mount: the spec may later describe other routers too.
const phantom = [...described]
    .filter((route) => route.includes(MOUNT))
    .filter((route) => !served.has(route))
    .sort();

const problems = [];
if (undocumented.length) {
    problems.push(`Served but not in the spec:\n  ${undocumented.join('\n  ')}`);
}
if (phantom.length) {
    problems.push(`In the spec but not served:\n  ${phantom.join('\n  ')}`);
}

if (problems.length) {
    throw new Error(`openapi.verify failed\n\n${problems.join('\n\n')}\n`);
}

if (!served.size) {
    throw new Error('openapi.verify found no routes in the router — the pattern has stopped matching');
}

console.log(`openapi.verify: ${served.size} routes, all described and none invented`);
