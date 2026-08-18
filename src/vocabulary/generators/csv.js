/**
 * A view as flat CSV.
 *
 * The old tool could **import** a spreadsheet of terms and could not export one, which made the
 * round trip impossible: you could not pull the vocabulary into a sheet, work on it, and put it
 * back. The columns here are the ones `skosCsvImport.js` reads, plus what the richer model adds, so
 * an exported sheet is close to a sheet the importer would accept.
 *
 * One row per **term**, not per placement. A term in three collections is one row whose `paths`
 * cell names all three — a person editing a sheet wants one row to edit, and a term repeated three
 * times invites three divergent edits to the same definition.
 *
 * @module vocabulary/generators/csv
 */

import { placementsByTerm, schemesOf, tagsFor } from '../resolve.js';
import { localised, otherLabels, prefLabel } from '../store/read.js';

/**
 * Multiple values share a cell separated by a pipe, matching what the importer already splits
 * `altLabel` on. A comma would need the cell quoted and is likelier to appear inside a label.
 */
const MULTI = ' | ';

/**
 * Quote a cell for CSV.
 *
 * Everything is quoted rather than only what needs it: a definition containing a comma, a newline
 * or a quote is ordinary in this data, and conditional quoting is where CSV writers go wrong.
 *
 * @param {*} value
 * @returns {string}
 */
const cell = ((value) => `"${String(value ?? '').replace(/"/g, '""')}"`);

/**
 * The columns, in order.
 *
 * `id` first because it is what makes a re-import an update rather than a duplicate — the importer
 * treats a blank id as a new term and a present one as an edit.
 */
const COLUMNS = [
    'id',
    'prefLabel',
    'displayLabel',
    'definition',
    'status',
    'altLabel',
    'labelTypes',
    'notes',
    'noteTypes',
    'examples',
    'collections',
    'paths',
    'tags',
];

/**
 * @param {object} resolution
 * @returns {string}
 */
export function toCsv(resolution) {
    const { language } = resolution;
    const byTerm = placementsByTerm(resolution);

    const rows = [...byTerm.entries()].map(([termId, placements]) => {
        const term = resolution.terms.get(termId);
        const alternates = otherLabels(term);

        // Every collection this term appears in, and the rendered name at each appearance. The two
        // stay in the same order so a reader can line them up.
        const collections = [...new Set(placements.flatMap((placement) => schemesOf(placement)))];
        const paths = [...new Set(placements.map((placement) => placement.display))];

        return {
            id: termId,
            prefLabel: prefLabel(term, language),
            // Differs from prefLabel only when the view renders dotted names, and then it is the
            // value a consumer actually uses.
            displayLabel: paths.join(MULTI),
            definition: localised(term.definition, language),
            status: term.status,
            altLabel: alternates.map((label) => label.value).join(MULTI),
            // Kept beside the labels rather than folded into them, so the sheet stays readable and
            // the distinction the model records is not lost on the way out.
            labelTypes: alternates.map((label) => label.labelType).join(MULTI),
            notes: (term.note ?? []).map((note) => note.value).join(MULTI),
            noteTypes: (term.note ?? []).map((note) => note.noteType).join(MULTI),
            examples: (term.example ?? []).map((example) => example.value).join(MULTI),
            collections: collections.join(MULTI),
            paths: paths.join(MULTI),
            tags: tagsFor(resolution, termId).join(MULTI),
        };
    });

    // Sorted by rendered name so a diff between two exports is readable. Unsorted output changes
    // order whenever Mongo feels like it, and every line then reads as changed.
    rows.sort((a, b) => a.prefLabel.localeCompare(b.prefLabel));

    const lines = [
        COLUMNS.map(cell).join(','),
        ...rows.map((row) => COLUMNS.map((column) => cell(row[column])).join(',')),
    ];
    return `${lines.join('\n')}\n`;
}
