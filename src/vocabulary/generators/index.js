/**
 * The generators, and the one call that runs any of them.
 *
 * A generator turns a resolved view into an artifact for a particular consumer. They live here
 * rather than behind route handlers for three reasons the design settled on: they read Mongo
 * directly rather than through the API layer, they can therefore run from a build script with no
 * service in the path, and a new format is a module rather than a deploy of the gateway's routing.
 *
 * Adding one means adding an entry to `GENERATORS`. Nothing else changes.
 *
 * @module vocabulary/generators
 */

import { resolveView } from '../resolve.js';
import { skosProjectionIndex } from '../store/facetSeeds.js';
import { listFacets } from '../store/read.js';

import { toCsv } from './csv.js';
import { toViewJson } from './json.js';
import { skosTriples, toJsonLd, toTurtle } from './skos.js';

/**
 * @typedef {object} Artifact
 * @property {string|object} body
 * @property {string} contentType
 * @property {string} extension
 * @property {object} [problems] - Anything the generator could not express, stated rather than hidden
 */

/**
 * Every format, by name.
 *
 * `internal` is the resolution itself — the shape this service works in. It is offered because it is
 * occasionally what you want when debugging, and named `internal` rather than `json` precisely so
 * that no consumer mistakes it for a contract. `json` is the shaped document consumers should read.
 *
 * @type {Object<string, {contentType: string, extension: string, run: Function}>}
 */
const GENERATORS = {
    'internal': {
        contentType: 'application/json',
        extension: 'json',
        run: (resolution) => ({
            view: resolution.view,
            status: resolution.status,
            placements: resolution.placements,
            // What `arrange.hide` left out. Only this format carries them: an editor showing what a
            // view publishes has to draw the headings it does not, or there is no way to see what
            // was left out and no way to put it back.
            suppressed: resolution.suppressed,
            // Every term the view reaches, arrangements included — a term carrying `member` is
            // what used to be a separate collection document, so one map holds both.
            terms: Object.fromEntries(resolution.terms),
            problems: resolution.problems,
        }),
    },
    'json': {
        contentType: 'application/json',
        extension: 'json',
        run: (resolution) => toViewJson(resolution),
    },
    'csv': {
        contentType: 'text/csv',
        extension: 'csv',
        run: (resolution) => toCsv(resolution),
    },
    'skos-ttl': {
        contentType: 'text/turtle',
        extension: 'ttl',
        run: (resolution, projections) => {
            const { triples, problems } = skosTriples(resolution, projections);
            return { body: toTurtle(triples), problems };
        },
    },
    'skos-jsonld': {
        contentType: 'application/ld+json',
        extension: 'jsonld',
        run: (resolution, projections) => {
            const { triples, problems } = skosTriples(resolution, projections);
            return { body: toJsonLd(triples), problems };
        },
    },
};

/** The formats this service can produce. */
export const generatorNames = (() => Object.keys(GENERATORS));

/** Whether a name is a format. */
export const isGenerator = ((name) => Object.hasOwn(GENERATORS, name));

/**
 * Resolve a view and run a generator over it.
 *
 * @param {object} params
 * @param {string} params.viewId
 * @param {string} [params.format='json']
 * @param {string[]} [params.status] - Overrides the view's own default
 * @param {string} [params.language]
 * @returns {Promise<Artifact>}
 * @throws {Error} On an unknown view or an unknown format
 */
export async function generate({ viewId, format = 'json', status = null, language }) {
    if (!isGenerator(format)) {
        throw new Error(`No such format: ${format}. Available: ${generatorNames().join(', ')}`);
    }

    const [resolution, facets] = await Promise.all([
        resolveView({ viewId, status, language }),
        listFacets(),
    ]);
    const projections = skosProjectionIndex(facets);

    const generator = GENERATORS[format];
    const produced = generator.run(resolution, projections);

    // A generator may return a bare body or `{ body, problems }`. Both the resolver's problems and
    // the generator's are carried out to the caller: a view that silently dropped a hundred terms
    // and one that dropped none produce the same-looking document otherwise.
    const body = produced?.body !== undefined ? produced.body : produced;
    const problems = { ...resolution.problems, ...(produced?.problems ?? {}) };

    return {
        body,
        contentType: generator.contentType,
        extension: generator.extension,
        problems,
    };
}
