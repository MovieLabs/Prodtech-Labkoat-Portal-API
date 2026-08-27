/**
 * A view as flat CSV.
 *
 * The old tool could **import** a spreadsheet of terms and could not export one, which made the
 * round trip impossible: you could not pull the vocabulary into a sheet, work on it, and put it
 * back. The default columns are the ones `skosCsvImport.js` reads, plus what the richer model adds,
 * so an exported sheet is close to a sheet the importer would accept.
 *
 * What the columns are, what they are called and what order they come in is the view's decision now
 * — see `exportProfiles.js`. A view that has not made one publishes the list this file used to
 * hardcode, unchanged.
 *
 * One row per **term** by default, not per placement. A term in three collections is one row whose
 * `paths` cell names all three: a person editing a sheet wants one row to edit, and a term repeated
 * three times invites three divergent edits to the same definition. A profile may ask for a row per
 * placement instead, which is what a sheet of controlled values wants.
 *
 * @module vocabulary/generators/csv
 */

import { buildRows, joinCells } from './rows.js';
import { toZip } from './zip.js';

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
 * One table as a CSV document.
 *
 * @param {Array<{source: string, header: string}>} columns
 * @param {Array<string[]>} rows
 * @param {string} delimiter
 * @returns {string}
 */
function document(columns, rows, delimiter) {
    const lines = [
        columns.map((column) => cell(column.header)).join(delimiter),
        ...rows.map((row) => row.map(cell).join(delimiter)),
    ];
    return `${lines.join('\n')}\n`;
}

/**
 * A filename that cannot collide or surprise.
 *
 * Scheme names are written by people and reach a zip entry directly, so anything a filesystem reads
 * as a path or refuses outright has to go before it becomes a filename.
 *
 * @param {string} name
 * @returns {string}
 */
const fileSafe = ((name) => String(name)
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80) || 'sheet');

/**
 * @param {object} resolution
 * @param {object} profile
 * @param {Array<object>} facets
 * @returns {Promise<{body: string|Buffer, problems: object, contentType?: string, extension?: string}>}
 */
export async function toCsv(resolution, profile, facets) {
    const { groups, columns, problems } = buildRows(resolution, profile, facets);
    const delimiter = profile.delimiter ?? ',';
    const multi = profile.multi ?? ' | ';

    if (profile.split !== 'per-scheme') {
        return { body: document(columns, joinCells(groups[0].rows, multi), delimiter), problems };
    }

    // **A zip, and the artifact says so.** One CSV cannot hold several tables, so a split export is
    // several files; the generator overriding its own extension is what lets the caller stay
    // ignorant of that — the browser reads the name off `Content-Disposition`.
    const files = groups.map((group) => ({
        name: `${fileSafe(group.name)}.csv`,
        body: document(columns, joinCells(group.rows, multi), delimiter),
    }));

    return {
        body: await toZip(files),
        problems,
        contentType: 'application/zip',
        extension: 'zip',
    };
}
