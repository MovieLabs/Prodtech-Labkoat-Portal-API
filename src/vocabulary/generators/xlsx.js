/**
 * A view as a workbook.
 *
 * The format the people who maintain a vocabulary actually work in, and the one with room to present
 * rather than only to tabulate. Each scheme gets its own sheet, headed by what that scheme is: its
 * label, the other labels it goes by, and its notes.
 *
 * ## A sheet per scheme, always
 *
 * The shared spreadsheet profile has a `split` setting, and the workbook ignores it. A workbook's
 * whole advantage over a CSV is that it holds several tables, and the heading block below only means
 * anything on a sheet that *is* one scheme — a single sheet of everything has no one scheme to
 * describe. So `split` decides whether the CSV arrives as one file or a zip, and the workbook always
 * does the thing workbooks are for.
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

import { otherLabels } from '../store/read.js';

import { buildRows, joinCells } from './rows.js';

/** The header bar. */
const HEADER_FILL = 'FF56A1D5';

/** Rows 1 to 3 are the scheme's own description; the table starts below the gap after them. */
const NOTES_ROW = 3;
const HEADER_GAP = 3;

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

    // Two schemes may legitimately share a label. Excel refuses a duplicate sheet name outright, so
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
 * Which note types the profile publishes.
 *
 * The heading block shows the scheme's notes, and it shows the same kinds the table does — a profile
 * that leaves scope notes out of its columns did not ask to see them at the top of the sheet either.
 *
 * @param {object} profile
 * @returns {{all: boolean, types: Set<string>}}
 */
function selectedNotes(profile) {
    const sources = (profile.columns ?? []).map((column) => column.source);
    return {
        all: sources.includes('note:*'),
        types: new Set(sources
            .filter((source) => source.startsWith('note:') && source !== 'note:*')
            .map((source) => source.slice('note:'.length))),
    };
}

/**
 * The scheme's description: what it is called besides its label, and what is noted about it.
 *
 * @param {object|null} head - The term the scheme is derived from
 * @param {object} profile
 * @param {string} language
 * @returns {{synonyms: string, notes: string[]}}
 */
function describe(head, profile, language) {
    if (!head) return { synonyms: '', notes: [] };

    const others = otherLabels(head).map((entry) => entry.value).filter(Boolean);
    const wanted = selectedNotes(profile);

    const notes = (head.note ?? [])
        .filter((note) => wanted.all || wanted.types.has(note.noteType))
        .filter((note) => !note.language || note.language === language)
        .map((note) => note.value)
        .filter(Boolean);

    return {
        synonyms: others.length ? `Synonyms: ${others.join(', ')}` : '',
        notes,
    };
}

/**
 * @param {object} resolution
 * @param {object} profile
 * @param {Array<object>} facets
 * @returns {Promise<{body: Buffer, problems: object}>}
 */
export async function toXlsx(resolution, profile, facets) {
    // Always per scheme, whatever the shared profile says — see the note at the top.
    const { groups, columns, problems } = buildRows(
        resolution, { ...profile, split: 'per-scheme' }, facets,
    );
    const multi = profile.multi ?? ' | ';
    const { language } = resolution;

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
        const { synonyms, notes } = describe(group.head, profile, language);

        // A1 — what this sheet is.
        const title = sheet.getCell('A1');
        title.value = group.name;
        title.font = { bold: true, size: 16 };

        // A2 — the other labels it goes by, titled so the list is not mistaken for the scheme's own
        // label repeated.
        sheet.getCell('A2').value = synonyms;

        // A3 onwards — one row per note, of the kinds this profile publishes.
        notes.forEach((note, index) => {
            sheet.getCell(`A${NOTES_ROW + index}`).value = note;
        });

        // The table starts below a fixed gap, so every sheet in the workbook has its header on the
        // same row for a given number of notes and a reader scanning across them is not hunting.
        const headerRow = NOTES_ROW + notes.length + HEADER_GAP;

        const header = sheet.getRow(headerRow);
        columns.forEach((column, index) => {
            const cell = header.getCell(index + 1);
            cell.value = column.header;
            cell.font = { bold: true };
            cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_FILL } };
        });
        header.commit();

        joinCells(group.rows, multi).forEach((row, index) => {
            const target = sheet.getRow(headerRow + 1 + index);
            row.forEach((value, at) => {
                target.getCell(at + 1).value = value;
            });
            target.commit();
        });

        // Width and text format per column. Set on the column rather than through `sheet.columns`,
        // whose `header` would write a second header row at the top and overwrite the title block.
        columns.forEach((column, index) => {
            const target = sheet.getColumn(index + 1);
            target.width = Math.min(Math.max(column.header.length + 4, 18), 60);
            target.numFmt = '@';
        });

        // The header stays put while somebody scrolls a thousand terms, and can be filtered. Both
        // are what makes a sheet usable rather than merely correct.
        sheet.views = [{ state: 'frozen', ySplit: headerRow }];
        if (group.rows.length) {
            sheet.autoFilter = {
                from: { row: headerRow, column: 1 },
                to: { row: headerRow, column: columns.length },
            };
        }
    });

    // A workbook with no sheet at all is a file Excel refuses to open, and a view can legitimately
    // resolve to nothing under a strict status filter.
    if (!workbook.worksheets.length) workbook.addWorksheet('Empty');

    const body = await workbook.xlsx.writeBuffer();
    return { body: Buffer.from(body), problems };
}
