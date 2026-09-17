/**
 * The RDF facts as data, for a build elsewhere to write the Turtle itself.
 *
 * ## Why this is not the OMC-JSON export
 *
 * `omc-edge-definitions.json` is the OMC-JSON edge table: its domains and ranges are OMC-JSON
 * entityTypes, so every subclass has already been folded into the class it projects to — `Portrayal`
 * and `Depiction` both arrive as `Realization` — and the RDF names survive only as opaque
 * `const:omc:…` tokens. Turtle derived from it would lose exactly the distinctions the RDF exists to
 * make. This document carries the other half: the properties as RDF has them, before any projection.
 *
 * ## What it holds
 *
 * Everything `omc-edges.ttl` and `omc-edge-shapes.ttl` are written from, and nothing about how they
 * are written. A consumer decides the syntax; the facts are the same either way.
 *
 * @module vocabulary/edges/generators/rdfBundle
 */

import { edgeProperties } from './owl.js';

/**
 * The bundle.
 *
 * @param {object} ctx - `{ edges, pairs, index, settings }`
 * @returns {{body: object, problems: object}}
 */
export function toRdfBundle(ctx) {
    const found = edgeProperties(ctx);

    // Each property's inverse expressions, gathered from the flat list the generator works in.
    const answering = new Map();
    found.propertyInverses.forEach(({ from, to }) => {
        answering.set(from, [...(answering.get(from) ?? []), to]);
    });

    const body = {
        generated: {
            format: 'omc-edge-rdf',
            version: 1,
            viewId: ctx.settings.viewId,
            verbs: found.verbs.length,
            properties: found.properties.length,
        },
        namespace: { prefix: ctx.settings.rdf.prefix, base: ctx.settings.rdf.base },
        // A verb every specific property below sits under. `inverse` is stated here only where this
        // verb belongs to one pair and that pair is not an OMC-JSON intrinsic; otherwise the specific
        // properties carry `inverseOf` expressions instead.
        verbs: found.verbs.map((verb) => ({
            id: verb.id,
            name: verb.name,
            definition: verb.definition,
            symmetric: verb.symmetric,
            inverse: verb.inverse,
        })),
        properties: found.properties.map((property) => ({
            id: property.id,
            name: property.name,
            verbs: [...property.verbs].sort(),
            domains: [...property.domains].sort(),
            ranges: [...property.ranges].sort(),
            inverseOf: answering.get(property.id) ?? [],
        })),
    };

    return {
        body,
        problems: {
            ...(found.skipped.length ? { skipped: found.skipped } : {}),
            ...(found.verbConflicts.length ? { verbConflicts: found.verbConflicts } : {}),
        },
    };
}
