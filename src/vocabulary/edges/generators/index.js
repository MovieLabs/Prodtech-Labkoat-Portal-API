/**
 * The edge generators, and the one call that runs any of them.
 *
 * A sibling of the vocabulary's generator registry rather than entries in it: those are run over one
 * view and offered in every view's download menu, and these are run over the edge definitions,
 * which belong to no view.
 *
 * Adding a format means adding an entry to `EDGE_GENERATORS`. Nothing else changes.
 *
 * @module vocabulary/edges/generators
 */

import { filenameFor } from '../../generators/index.js';
import { listEdges, loadEdgeContext } from '../store.js';

import { toEdgeCsv } from './csv.js';
import { toEdgeDefinitions } from './json.js';
import { toOwlTurtle, toShaclTurtle } from './owl.js';

/**
 * Every format, by name. `run` takes `{ edges, pairs, index, settings }` and returns
 * `{ body, problems }`. `stem` is what the file is called.
 *
 * @type {Object<string, {label: string, contentType: string, extension: string, stem: string, run: Function}>}
 */
const EDGE_GENERATORS = {
    'json': {
        label: 'OMC-JSON edge definitions',
        contentType: 'application/json',
        extension: 'json',
        stem: 'omc-edge-definitions',
        run: toEdgeDefinitions,
    },
    'owl-ttl': {
        label: 'RDF properties (Turtle)',
        contentType: 'text/turtle',
        extension: 'ttl',
        stem: 'omc-edges',
        run: toOwlTurtle,
    },
    'shacl-ttl': {
        label: 'RDF usage shapes (SHACL Turtle)',
        contentType: 'text/turtle',
        extension: 'ttl',
        stem: 'omc-edge-shapes',
        run: toShaclTurtle,
    },
    'csv': {
        label: 'CSV',
        contentType: 'text/csv',
        extension: 'csv',
        stem: 'omc-edges',
        run: toEdgeCsv,
    },
};

/**
 * The formats, described for a client offering a download it has never heard of.
 *
 * @returns {Array<{format: string, label: string, contentType: string, extension: string}>}
 */
export const edgeFormats = (() => Object.entries(EDGE_GENERATORS)
    .map(([format, { label, contentType, extension }]) => ({
        format, label, contentType, extension,
    })));

/** Whether a name is an edge format. */
export const isEdgeFormat = ((name) => Object.hasOwn(EDGE_GENERATORS, name));

/**
 * Run a generator over the edge definitions.
 *
 * @param {object} params
 * @param {string} params.format
 * @param {string[]} [params.status] - Only edges with one of these statuses
 * @returns {Promise<{body: string|object, contentType: string, extension: string, filename: string, problems: object}>}
 * @throws {Error} On an unknown format
 */
export async function generateEdges({ format, status = null }) {
    if (!isEdgeFormat(format)) {
        throw new Error(`No such format: ${format}. Available: ${Object.keys(EDGE_GENERATORS).join(', ')}`);
    }
    const generator = EDGE_GENERATORS[format];
    const [context, edges] = await Promise.all([loadEdgeContext(), listEdges({ status })]);
    const produced = await generator.run({ ...context, edges });
    return {
        body: produced.body,
        contentType: generator.contentType,
        extension: generator.extension,
        filename: filenameFor({ filename: generator.stem }, generator.extension),
        problems: { ...context.index.problems.length ? { classes: context.index.problems } : {}, ...produced.problems },
    };
}
