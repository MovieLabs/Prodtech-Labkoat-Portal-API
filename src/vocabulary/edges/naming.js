/**
 * The names an edge publishes under, generated from its predicate pair and the two classes it joins.
 *
 * ## Generated, then stored
 *
 * A name is an identifier somebody else keys on, so it is written onto the edge rather than derived
 * whenever it is read: renaming a class in the vocabulary must never move a published path without
 * anybody deciding it should. What is stored is `{ value, override }` per name. `override` is what a
 * person typed, or null; `value` is the override, or else what was generated when the edge was last
 * saved or accepted. An edge whose stored value no longer matches what would be generated now has
 * drifted, and the check says so.
 *
 * ## Only here
 *
 * The rules — an OMC-JSON edge lives at `edges.<predicate>.<Range>`, an intrinsic one at a named
 * property, an RDF property is the verb joined to the class it points at — are OMC's conventions.
 * Every client asks this module through the API rather than restating them.
 *
 * @module vocabulary/edges/naming
 */

/** Placement of a reference in OMC-JSON: under `edges`, or at a named property of the entity. */
export const PLACEMENTS = ['edges', 'property'];

/** What a template fills in when neither the pair nor the settings name one. */
export const DEFAULT_TEMPLATES = {
    edgesTemplate: 'edges.{predicate}.{range}',
    propertyTemplate: '{Predicate}',
    rdfTemplate: '{verb}{Range}',
};

/** The name fields an edge direction carries, each stored as `{ value, override }`. */
export const NAME_FIELDS = ['placement', 'predicate', 'path', 'rdfName'];

const capitalise = ((word) => (word ? word.charAt(0).toUpperCase() + word.slice(1) : ''));

/**
 * Fill a template's placeholders.
 *
 * @param {string} template
 * @param {Object<string, string>} values - Placeholder name → text
 * @returns {string}
 */
const fill = ((template, values) => template.replace(/\{(\w+)\}/g, (whole, key) => values[key] ?? whole));

/**
 * The names one direction of an edge would be given.
 *
 * `range.jsonType` is the OMC-JSON entityType the class projects to; a class with none projects to
 * nothing, and the direction then has no JSON path. `range.name` is the class's own RDF local name,
 * which is what lets `depictedBy` a Depiction and `realizedBy` a Realization be different properties
 * while both publish to OMC-JSON as a Realization.
 *
 * @param {object} params
 * @param {object} params.side - One direction of a predicate pair: `{ verb, json: { placement, pathTemplate }, rdf: { template } }`
 * @param {{name: string, jsonType: string|null}} params.domain
 * @param {{name: string, jsonType: string|null}} params.range
 * @param {object} [params.settings] - The edge settings, for their `json` and `rdf` templates
 * @returns {{placement: string, predicate: string, path: string|null, rdfName: string}}
 */
export function generateNames({
    side, domain, range, settings = {},
}) {
    const verb = side?.verb ?? '';
    const placement = PLACEMENTS.includes(side?.json?.placement) ? side.json.placement : 'edges';
    const predicate = placement === 'property' ? capitalise(verb) : verb;

    const pathTemplate = side?.json?.pathTemplate
        || (placement === 'edges'
            ? settings.json?.edgesTemplate ?? DEFAULT_TEMPLATES.edgesTemplate
            : settings.json?.propertyTemplate ?? DEFAULT_TEMPLATES.propertyTemplate);
    const path = range?.jsonType
        ? fill(pathTemplate, {
            predicate: verb, Predicate: capitalise(verb), range: range.jsonType,
        })
        : null;

    const rdfTemplate = side?.rdf?.template || settings.rdf?.template || DEFAULT_TEMPLATES.rdfTemplate;
    // An RDF property starts lower-case even where its OMC-JSON predicate is a named property.
    const rdfName = fill(rdfTemplate, {
        verb: verb.charAt(0).toLowerCase() + verb.slice(1), Verb: capitalise(verb), Range: range?.name ?? '', Domain: domain?.name ?? '',
    });

    return {
        placement, predicate, path, rdfName,
    };
}

/**
 * One direction's stored names, brought up to date with what was generated.
 *
 * An override stands; everything else takes the generated value.
 *
 * @param {object} [stored] - The direction as stored, holding `{ value, override }` per name field
 * @param {object} generated - From `generateNames`
 * @returns {Object<string, {value: *, override: *}>}
 */
export function applyNames(stored = {}, generated) {
    return Object.fromEntries(NAME_FIELDS.map((field) => {
        const override = stored[field]?.override ?? null;
        return [field, { value: override ?? generated[field], override }];
    }));
}

/**
 * The names whose stored value is not what would be generated now, and was not typed by anybody.
 *
 * An overridden name is never drift: somebody decided it. It is still reported, as `overridden`, so a
 * reader can see the generated value has moved on from it.
 *
 * @param {object} stored - The direction as stored
 * @param {object} generated - From `generateNames`
 * @returns {Array<{field: string, stored: *, generated: *, overridden: boolean}>}
 */
export function namesDrift(stored = {}, generated) {
    return NAME_FIELDS
        .filter((field) => (stored[field]?.value ?? null) !== (generated[field] ?? null)
            || (stored[field]?.override != null && stored[field].override !== generated[field]))
        .map((field) => ({
            field,
            stored: stored[field]?.value ?? null,
            generated: generated[field] ?? null,
            overridden: stored[field]?.override != null,
        }))
        .filter((entry) => entry.overridden || entry.stored !== entry.generated);
}
