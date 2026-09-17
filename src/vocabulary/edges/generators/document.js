/**
 * Everything the edge definitions are, in one document, for every build that consumes them.
 *
 * ## One file, two projections
 *
 * The same relationships publish two ways. **`json`** is the OMC-JSON edge table omc-util builds its
 * templates from: domains and ranges are OMC-JSON entityTypes, so a subclass has already been folded
 * into the class it projects to. **`rdf`** is the properties as RDF has them, before any projection,
 * where `Portrayal` and `Depiction` are still themselves.
 *
 * Neither can be derived from the other, which is why both are here rather than in two files: two
 * documents that have to agree eventually disagree, and a consumer reading one would have no way to
 * tell. Each build takes the section it needs and ignores the rest, and a section added later — the
 * classes, say — breaks nobody.
 *
 * @module vocabulary/edges/generators/document
 */

import { toEdgeDefinitions } from './json.js';
import { toRdfBundle } from './rdfBundle.js';

/**
 * The edge document.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{body: object, problems: object}}
 */
export function toEdgeDocument(ctx) {
    const json = toEdgeDefinitions(ctx);
    const rdf = toRdfBundle(ctx);

    return {
        body: {
            generated: {
                format: 'omc-edges',
                version: 1,
                viewId: ctx.settings.viewId,
                edges: json.body.generated.edges,
                rows: json.body.generated.rows,
                verbs: rdf.body.generated.verbs,
                properties: rdf.body.generated.properties,
            },
            namespace: rdf.body.namespace,
            json: { edgeDefinitions: json.body.edgeDefinitions },
            rdf: { verbs: rdf.body.verbs, properties: rdf.body.properties },
        },
        // Each projection reports its own; a reader sees which half a problem belongs to.
        problems: {
            ...(Object.keys(json.problems).length ? { json: json.problems } : {}),
            ...(Object.keys(rdf.problems).length ? { rdf: rdf.problems } : {}),
        },
    };
}
