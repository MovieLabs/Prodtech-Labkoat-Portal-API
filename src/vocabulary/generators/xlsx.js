/**
 * A view as a workbook.
 *
 * The format the people who maintain a vocabulary actually work in. A workbook's one advantage over
 * a CSV is that it holds several tables, which is why this is the format whose useful default is to
 * split: one sheet per scheme, which is what a view publishing twelve vocabularies wants and what a
 * zip of twelve CSVs makes hard work of.
 *
 * ## Every cell is written as text
 *
 * A vocabulary is text. Left to guess, a spreadsheet reads `16E-1` as scientific notation and `12-1`
 * as a date — which is exactly how 42 identifiers were destroyed in a Frame.io sample, and the same
 * hazard the CSV importer already had to be taught about. Writing cells as strings and setting the
 * column format to text is what stops Excel re-interpreting them on open.
 *
 * @module vocabulary/generators/xlsx
 */

import ExcelJS from 'exceljs';

import { buildRows, joinCells } from './rows.js';

/**
 * A sheet name Excel will accept.
 *
 * The rules are Excel's, not ours: 31 characters, and none of `\ / ? * [ ] :`. A name breaking them
 * makes the workbook unopenable rather than oddly named, so this is a correctness step.
 *
 * @param {string} name
 * @param {Set<string>} used
 * @returns {string}
 */
function sheetName(name, used) {
    const cleaned = String(name).replace(/[\\/?*[\]:]/g, '-').slice(0, 31).trim() || 'Sheet';

    // Two schemes may legitimately share a name. Excel refuses a duplicate sheet name outright, so
    // this is not tidiness either.
    if (!used.has(cleaned)) {
        used.add(cleaned);
        return cleaned;
    }
    let n = 2;
    while (used.has(`${cleaned.slice(0, 28)}-${n}`)) n += 1;
    const next = `${cleaned.slice(0, 28)}-${n}`;
    used.add(next);
    return next;
}

/**
 * @param {object} resolution
 * @param {object} profile
 * @param {Array<object>} facets
 * @returns {Promise<{body: Buffer, problems: object}>}
 */
export async function toXlsx(resolution, profile, facets) {
    const { groups, columns, problems } = buildRows(resolution, profile, facets);
    const multi = profile.multi ?? ' | ';

    const workbook = new ExcelJS.Workbook();
    workbook.creator = 'MovieLabs Vocabulary';
    // Fixed rather than "now", for the reason the zip dates are fixed: two exports of an unchanged
    // vocabulary must not differ, or the check that says whether a published artifact moved is worth
    // nothing.
    workbook.created = new Date(0);
    workbook.modified = new Date(0);

    const used = new Set();

    groups.forEach((group) => {
        const sheet = workbook.addWorksheet(sheetName(group.name, used));

        sheet.columns = columns.map((column) => ({
            header: column.header,
            key: column.source,
            // Wide enough to read without being so wide the sheet needs scrolling. A definition is
            // the long one and is what this is sized for.
            width: Math.min(Math.max(column.header.length + 4, 18), 60),
            style: { numFmt: '@' },
        }));

        joinCells(group.rows, multi).forEach((row) => sheet.addRow(row));

        // The header row stays put while somebody scrolls a thousand terms, and can be filtered.
        // Both are what makes a sheet usable rather than merely correct.
        sheet.getRow(1).font = { bold: true };
        sheet.views = [{ state: 'frozen', ySplit: 1 }];
        if (sheet.rowCount > 1) {
            sheet.autoFilter = {
                from: { row: 1, column: 1 },
                to: { row: 1, column: columns.length },
            };
        }
    });

    // A workbook with no sheet at all is a file Excel refuses to open, and a view can legitimately
    // resolve to nothing under a strict status filter.
    if (!workbook.worksheets.length) workbook.addWorksheet('Empty');

    const body = await workbook.xlsx.writeBuffer();
    return { body: Buffer.from(body), problems };
}
