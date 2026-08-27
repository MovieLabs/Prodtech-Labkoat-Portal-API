/**
 * A view as Markdown tables.
 *
 * For the places the vocabulary is read rather than parsed — a repository's documentation, a wiki
 * page, a pull request. The point is that it can be regenerated: a table pasted in by hand goes
 * stale the day after it is written, and nothing says when.
 *
 * A Markdown table is **read**, so the default profile carries three columns rather than the
 * fourteen CSV publishes. A table wide enough to need horizontal scrolling communicates less than
 * no table.
 *
 * @module vocabulary/generators/markdown
 */

import { buildRows, joinCells } from './rows.js';

/**
 * Escape a value for a Markdown table cell.
 *
 * A pipe would end the cell, and a newline would end the row — both silently, producing a table
 * that renders with its columns shifted rather than one that fails. Definitions contain both.
 *
 * @param {*} value
 * @returns {string}
 */
const cell = ((value) => String(value ?? '')
    .replace(/\|/g, '\\|')
    .replace(/\r?\n/g, '<br>'));

/**
 * One table.
 *
 * @param {Array<{source: string, header: string}>} columns
 * @param {Array<string[]>} rows
 * @returns {string}
 */
function table(columns, rows) {
    const head = `| ${columns.map((column) => cell(column.header)).join(' | ')} |`;
    const rule = `| ${columns.map(() => '---').join(' | ')} |`;
    const body = rows.map((row) => `| ${row.map(cell).join(' | ')} |`);
    return [head, rule, ...body].join('\n');
}

/**
 * `split: 'per-scheme'` means **one table per scheme**, and each format expresses that the way its
 * own syntax allows: CSV a zip of files, XLSX a sheet each, and Markdown a heading each in one
 * document. Markdown is the format that can hold many tables without being packed, so it is the one
 * where splitting costs the reader nothing — a page to scroll beats an archive to unpack.
 *
 * @param {object} resolution
 * @param {object} profile
 * @param {Array<object>} facets
 * @returns {Promise<{body: string, problems: object}>}
 */
export async function toMarkdown(resolution, profile, facets) {
    const { groups, columns, problems } = buildRows(resolution, profile, facets);
    const multi = profile.multi ?? ' | ';

    if (profile.split !== 'per-scheme') {
        // Unsplit, the groups collapse to one and there is nothing to head. A single `##` above a
        // single table is a heading that says only what the file already says.
        const only = groups[0];
        return { body: `${table(columns, joinCells(only.rows, multi))}\n`, problems };
    }

    // Split, but still one document: a `##` per scheme. Markdown has headings, so it can hold what
    // a CSV needs separate files for — and one page somebody can scroll beats a zip they have to
    // unpack to read three tables.
    const body = groups
        .map((group) => `## ${group.name}\n\n${table(columns, joinCells(group.rows, multi))}\n`)
        .join('\n');

    return { body, problems };
}
