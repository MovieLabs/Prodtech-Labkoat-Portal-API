/**
 * What the vocabulary says, against what a JSON Schema says, in both directions.
 *
 * ## The problem this measures
 *
 * The same controlled vocabulary is written down in several places with nothing connecting them:
 * the vocabulary itself, and the hand-maintained `x-controlledValues` tables in the OMC-JSON schema.
 * Nothing has ever compared the two. Measured against the vocabulary as it stood before the OMC
 * merge, **258 of the schema's 307 controlled values had no term defining them at all** — drift that
 * had been accumulating for years with no way to see it.
 *
 * This report is the way to see it. It is deliberately symmetric, because both directions are real
 * problems and they are different problems:
 *
 * - **A schema value with no term** is a value nobody has defined. A consumer reading the schema
 *   finds a string with no meaning attached.
 * - **A term with no schema value** is a value the schema will reject. Somebody added it to the
 *   vocabulary and the schema never caught up.
 *
 * ## Why the schema is an argument and not an import
 *
 * This system does not deal in OMC-JSON and never imports `omc-util`. The dependency points the
 * other way: a build step elsewhere fetches a view and regenerates a table. So the schema arrives
 * as **data** — a path on the command line, a body on the route — and this module knows only that
 * it is a JSON document with `x-controlledValues` arrays somewhere inside it.
 *
 * ## `x-controlledValues` is advisory
 *
 * Ajv ignores `x-` keywords, so unlike `enum` these tables **are not enforced**. A document carrying
 * a value that appears in no table still validates. That is what makes the drift invisible without
 * a report like this one, and it is why the report matters more than it would if the schema
 * enforced its own tables.
 *
 * @module vocabulary/driftReport
 */

import { resolveView } from './resolve.js';

/** The schema keyword holding an advisory list of permitted values. */
const KEYWORD = 'x-controlledValues';

/**
 * Every controlled-value table in a schema document, with where it was found.
 *
 * Walks the whole document rather than looking in known places: the tables sit at four different
 * depths in v3.0 — under an entity's property, under a `$defs` shared definition, inside an
 * `items`, and directly under a container — and a walker cannot be wrong about that the way a list
 * of paths can.
 *
 * @param {object} schema - A parsed JSON Schema document
 * @returns {Array<{path: string, property: string, values: string[]}>}
 */
export function controlledValueTables(schema) {
    const found = [];

    const walk = ((node, path) => {
        if (!node || typeof node !== 'object') return;
        if (Array.isArray(node)) {
            node.forEach((child, at) => walk(child, `${path}/${at}`));
            return;
        }
        if (Array.isArray(node[KEYWORD])) {
            found.push({
                path,
                // The last path segment that is not a schema keyword — `assetFunctionType` rather
                // than `properties`. It is what a person calls the table.
                property: path.split('/').filter((segment) => ![
                    'properties', 'items', '$defs', 'allOf', 'anyOf', 'oneOf', '',
                ].includes(segment)).pop() ?? path,
                values: node[KEYWORD].filter((value) => typeof value === 'string'),
            });
        }
        Object.entries(node).forEach(([key, value]) => {
            if (key === KEYWORD) return;
            walk(value, `${path}/${key}`);
        });
    });

    walk(schema, '');
    return found;
}

/**
 * Which collection in the view best accounts for a schema table.
 *
 * Matched by **what the two contain**, never by name. The names do not line up and never will —
 * the schema's `assetFunctionType` is the graph's `functionalType (Asset)`, and six different
 * schema tables correspond to properties all called `narrativeType`. A hand-maintained mapping
 * between them would be one more copy of the same knowledge, drifting alongside the rest.
 *
 * Overlap answers it instead, and it answers honestly: a table matching nothing scores zero and is
 * reported as unmatched rather than attached to whichever collection sounded closest.
 *
 * @param {string[]} values - The table's values
 * @param {Map<string, Set<string>>} byCollection - collection id → the names it renders
 * @returns {{collection: string|null, overlap: number}}
 */
function bestMatch(values, byCollection) {
    let best = { collection: null, overlap: 0 };
    byCollection.forEach((names, collection) => {
        const overlap = values.filter((value) => names.has(value)).length;
        if (overlap > best.overlap) best = { collection, overlap };
    });
    return best;
}

/**
 * Compare a view's rendered names against a schema's controlled-value tables.
 *
 * @param {object} params
 * @param {string} params.viewId
 * @param {object} params.schema - The schema document, as data
 * @param {string[]} [params.status] - Overrides the view's own status filter
 * @returns {Promise<object>} The report
 */
export async function driftReport({ viewId, schema, status = null }) {
    const resolution = await resolveView({ viewId, status });

    // A term placed in two collections renders the same name twice, and one of those is not a
    // second controlled value. Compared as sets throughout.
    const rendered = new Map();
    const byCollection = new Map();
    resolution.placements.forEach((placement) => {
        if (!rendered.has(placement.display)) {
            rendered.set(placement.display, { term: placement.termId, collections: new Set() });
        }
        rendered.get(placement.display).collections.add(placement.collectionId);

        if (!byCollection.has(placement.collectionId)) byCollection.set(placement.collectionId, new Set());
        byCollection.get(placement.collectionId).add(placement.display);
    });

    const tables = controlledValueTables(schema);
    const schemaValues = new Set(tables.flatMap((table) => table.values));

    // ---- schema -> vocabulary ----

    const perTable = tables.map((table) => {
        const match = bestMatch(table.values, byCollection);
        const missing = table.values.filter((value) => !rendered.has(value));
        const collection = match.collection ? resolution.collections.get(match.collection) : null;
        return {
            path: table.path,
            property: table.property,
            values: table.values.length,
            defined: table.values.length - missing.length,
            missing,
            matchedCollection: match.collection,
            matchedLabel: (collection?.label ?? []).find((label) => label.labelType === 'pref')?.value ?? null,
            overlap: match.overlap,
        };
    });

    const missingFromVocabulary = [...schemaValues]
        .filter((value) => !rendered.has(value))
        .sort();

    // ---- vocabulary -> schema ----

    const missingFromSchema = [...rendered.entries()]
        .filter(([name]) => !schemaValues.has(name))
        .map(([name, entry]) => ({
            value: name,
            term: entry.term,
            collections: [...entry.collections],
        }))
        .sort((a, b) => a.value.localeCompare(b.value));

    const dotted = [...schemaValues].filter((value) => value.includes('.'));
    const dottedDefined = dotted.filter((value) => rendered.has(value));

    return {
        view: viewId,
        schema: {
            tables: tables.length,
            values: tables.reduce((total, table) => total + table.values.length, 0),
            distinctValues: schemaValues.size,
            dotted: dotted.length,
        },
        vocabulary: {
            names: rendered.size,
            placements: resolution.placements.length,
            collections: byCollection.size,
        },
        summary: {
            defined: schemaValues.size - missingFromVocabulary.length,
            missingFromVocabulary: missingFromVocabulary.length,
            missingFromSchema: missingFromSchema.length,
            // The dotted values are the ones that only come out right if the nesting is right, so
            // they are reported on their own — a drop here means the member walk changed shape.
            dottedDefined: dottedDefined.length,
            dottedTotal: dotted.length,
            // Terms named by their preferred label because they carry no label of the kind this
            // view asked for. Every one is a name that may be wrong.
            namedByFallback: resolution.problems.untyped?.length ?? 0,
        },
        tables: perTable,
        missingFromVocabulary,
        missingFromSchema,
        problems: resolution.problems,
    };
}

/**
 * Render a report for a person.
 *
 * @param {object} report - From `driftReport`
 * @param {object} [options]
 * @param {number} [options.limit] - How many values to list per direction
 * @returns {string}
 */
export function formatDrift(report, { limit = 25 } = {}) {
    const lines = [];
    const heading = ((text) => lines.push(`\n${text}\n${'-'.repeat(text.length)}`));

    heading('Drift');
    lines.push(`  schema:     ${report.schema.tables} tables, ${report.schema.values} values `
        + `(${report.schema.distinctValues} distinct, ${report.schema.dotted} dotted)`);
    lines.push(`  vocabulary: ${report.vocabulary.names} names over ${report.vocabulary.placements} `
        + `placements in ${report.vocabulary.collections} collections`);
    lines.push('');
    lines.push(`  defined by a term:        ${report.summary.defined} / ${report.schema.distinctValues}`);
    lines.push(`  in the schema, undefined: ${report.summary.missingFromVocabulary}`);
    lines.push(`  in the vocabulary only:   ${report.summary.missingFromSchema}`);
    lines.push(`  dotted values defined:    ${report.summary.dottedDefined} / ${report.summary.dottedTotal}`);
    if (report.summary.namedByFallback) {
        lines.push(`  ! ${report.summary.namedByFallback} terms named by their preferred label because they `
            + 'carry no label of the kind this view publishes. Those names may be wrong.');
    }

    heading('Per table');
    report.tables
        .slice()
        .sort((a, b) => (a.values - a.defined) - (b.values - b.defined))
        .reverse()
        .forEach((table) => {
            const gap = table.values - table.defined;
            lines.push(`  ${String(table.defined).padStart(3)}/${String(table.values).padEnd(3)} `
                + `${table.property.padEnd(28)} ${table.matchedLabel ?? '(no matching collection)'}`);
            if (gap) lines.push(`          missing: ${table.missing.slice(0, 8).join(', ')}${gap > 8 ? ` … +${gap - 8}` : ''}`);
        });

    if (report.missingFromVocabulary.length) {
        heading(`In the schema with no term (${report.missingFromVocabulary.length})`);
        report.missingFromVocabulary.slice(0, limit).forEach((value) => lines.push(`  ${value}`));
        if (report.missingFromVocabulary.length > limit) {
            lines.push(`  … and ${report.missingFromVocabulary.length - limit} more`);
        }
    }

    if (report.missingFromSchema.length) {
        heading(`In the vocabulary, not in the schema (${report.missingFromSchema.length})`);
        report.missingFromSchema.slice(0, limit).forEach((entry) => {
            lines.push(`  ${entry.value.padEnd(44)} ${entry.term}`);
        });
        if (report.missingFromSchema.length > limit) {
            lines.push(`  … and ${report.missingFromSchema.length - limit} more`);
        }
    }

    return lines.join('\n');
}
