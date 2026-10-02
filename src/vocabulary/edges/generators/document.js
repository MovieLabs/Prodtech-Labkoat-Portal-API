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
 * tell. Each build takes the section it needs and ignores the rest.
 *
 * ## The classes join the two
 *
 * **`classes`** is what the projections are of. A class is published under its RDF local name and
 * says which OMC-JSON entityType it projects to, which is the only statement that connects the two
 * sections: an RDF property ranging over `omc:NarrativeProp` and an OMC-JSON edge ranging over
 * `NarrativeObject` are the same relationship, and nothing else here says so. Without it a consumer
 * reading both sections can only match an end whose RDF class happens to share the entityType's
 * name, and a narrowed one — which is every end worth narrowing — silently matches nothing.
 *
 * @module vocabulary/edges/generators/document
 */

import { isEdgeClass } from '../classes.js';

import { toEdgeDefinitions } from './json.js';
import { toRdfBundle } from './rdfBundle.js';

/**
 * The view's classes, as a consumer of either projection needs them.
 *
 * Only a term the vocabulary gave a role: an untagged term is a field or a controlled value, not a
 * class. Superclasses are published by name rather than by term id, so a reader never has to hold
 * the view's internal ids to walk the hierarchy.
 *
 * @param {Map<string, object>} classes - From `classIndex`
 * @param {string} prefix - The RDF prefix, so an id matches the one a property states
 * @returns {Array<object>}
 */
const toClasses = ((classes, prefix) => {
    const nameOf = ((id) => (classes.get(id)?.name ? `${prefix}:${classes.get(id).name}` : null));
    return [...classes.values()]
        .filter((entry) => entry.role)
        .map((entry) => ({
            id: `${prefix}:${entry.name}`,
            name: entry.name,
            label: entry.label,
            role: entry.role,
            joinable: isEdgeClass(entry),
            // The entityType this class is published as in OMC-JSON; null where it projects to none.
            jsonType: entry.jsonType,
            supers: (entry.supers ?? []).map(nameOf).filter(Boolean),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
});

/**
 * The edge document.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{body: object, problems: object}}
 */
export function toEdgeDocument(ctx) {
    const json = toEdgeDefinitions(ctx);
    const rdf = toRdfBundle(ctx);
    const classes = toClasses(ctx.index.classes, ctx.settings.rdf.prefix);

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
                classes: classes.length,
            },
            namespace: rdf.body.namespace,
            classes,
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
