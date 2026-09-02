/**
 * A view as a workbook.
 *
 * The format the people who maintain a vocabulary actually work in, and the one with room to present
 * rather than only to tabulate. Each scheme gets its own sheet, headed by what that scheme is: its
 * label, its definition, the other labels it goes by, and its notes.
 *
 * That heading block is why there is no Ungrouped sheet here, where the other tabular formats have
 * one: the terms that fall outside every scheme are the scheme heads themselves, and each is already
 * the heading of its own sheet.
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

import { localised, otherLabels } from '../store/read.js';

import { buildRows, joinCells } from './rows.js';

/** The header bar. */
const HEADER_FILL = 'FF56A1D5';

/**
 * Where the scheme's own description sits, and where the table starts below it.
 *
 * A1 its label, A2 its definition, then one row for each kind of name it also goes by, then one row
 * per note. The table follows a fixed gap below whatever that comes to.
 */
const DEFINITION_ROW = 2;
const DESCRIPTION_ROW = 3;
const HEADER_GAP = 2;

/**
 * Each type in a controlled set, to the heading it carries there.
 *
 * @param {Array<object>} facets
 * @param {string} appliesTo - `label` or `note`
 * @param {string} language
 * @returns {Map<string, string>}
 */
const headingsFor = ((facets, appliesTo, language) => new Map(facets
    .filter((facet) => facet.appliesTo === appliesTo)
    .flatMap((facet) => (facet.values ?? []).map((value) => [
        value[facet.key], value.label?.[language] ?? value[facet.key],
    ]))));

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
 * Which types of one kind the profile publishes.
 *
 * **The heading block describes the scheme with the same kinds the table gives its terms.** A
 * profile that leaves scope notes, or acronyms, out of its columns did not ask to see them at the
 * top of the sheet either — and a view whose rows carry no OMC Token column is not describing its
 * schemes with one. The columns are the whole of the decision, so there is no kind this block has an
 * opinion about on its own.
 *
 * @param {object} profile
 * @param {string} prefix - The array the types belong to: `label` or `note`
 * @returns {{all: boolean, types: Set<string>}}
 */
function selectedTypes(profile, prefix) {
    const sources = (profile.columns ?? []).map((column) => column.source);
    const at = `${prefix}:`;
    return {
        all: sources.includes(`${at}*`),
        types: new Set(sources
            .filter((source) => source.startsWith(at) && source !== `${at}*`)
            .map((source) => source.slice(at.length))),
    };
}

/**
 * The scheme's description: what it means, what else it is called, and what is noted about it.
 *
 * Every line is prefixed with the heading its type carries in the controlled set — a list of
 * unattributed values says nothing about which is a synonym and which an acronym, or which is a
 * scope note and which editorial.
 *
 * @param {object|null} head - The term the scheme is derived from
 * @param {object} profile
 * @param {Array<object>} facets
 * @param {string} language
 * @returns {{definition: string, names: string[], notes: string[]}}
 */
function describe(head, profile, facets, language) {
    if (!head) return { definition: '', names: [], notes: [] };

    const labelHeading = headingsFor(facets, 'label', language);
    const noteHeading = headingsFor(facets, 'note', language);

    // One row per kind of name, in the order the term holds them. Under a single `Synonyms` title
    // every other kind was reported as a synonym — most often the OMC token, since that is the kind
    // most terms actually carry. The preferred label is not among them: `otherLabels` leaves it out,
    // and it is already the sheet's title.
    const wantedNames = selectedTypes(profile, 'label');
    const byType = new Map();
    otherLabels(head)
        .filter((entry) => entry.value)
        .filter((entry) => wantedNames.all || wantedNames.types.has(entry.labelType))
        .forEach((entry) => {
            const held = byType.get(entry.labelType);
            if (held) held.push(entry.value);
            else byType.set(entry.labelType, [entry.value]);
        });
    const names = [...byType].map(([type, values]) => (
        `${labelHeading.get(type) ?? type}: ${values.join(', ')}`
    ));

    const wanted = selectedTypes(profile, 'note');
    const notes = (head.note ?? [])
        .filter((note) => wanted.all || wanted.types.has(note.noteType))
        .filter((note) => !note.language || note.language === language)
        .filter((note) => note.value)
        .map((note) => `${noteHeading.get(note.noteType) ?? note.noteType}: ${note.value}`);

    const definition = localised(head.definition, language);

    return {
        // Titled the way the names and the notes are, so the rows above the table read as a list of
        // what is known about the scheme rather than as one loose sentence and two lists.
        definition: definition ? `Definition: ${definition}` : '',
        names,
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
    const { groups: built, columns, problems } = buildRows(
        resolution, { ...profile, split: 'per-scheme' }, facets,
    );

    // **No Ungrouped sheet.** What lands there is the scheme heads: a head is attached to the view
    // directly, so it sits under no scheme and falls out of every group. In a workbook each one is
    // already the heading block of its own sheet — its label, definition, other labels and notes —
    // so the sheet repeats what the reader has just looked at.
    //
    // Kept when it is the only group, because a view with no scheme heads has nothing else, and a
    // workbook with no sheets is a file Excel refuses to open.
    const groups = built.length > 1 ? built.filter((group) => group.key !== 'unscoped') : built;
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
        const { definition, names, notes } = describe(group.head, profile, facets, language);

        // A1 — what this sheet is.
        const title = sheet.getCell('A1');
        title.value = group.name;
        title.font = { bold: true, size: 16 };

        // A2 — what it means, titled. Every scheme head carries a definition, so this is the row
        // that is almost always worth reading.
        sheet.getCell(`A${DEFINITION_ROW}`).value = definition;

        // A3 onwards — the names it also goes by, a row per kind and titled so none is mistaken for
        // the scheme's own label repeated, then one row per note of the kinds this profile
        // publishes. No row is reserved for a kind the scheme has none of.
        const description = [...names, ...notes];
        description.forEach((line, index) => {
            sheet.getCell(`A${DESCRIPTION_ROW + index}`).value = line;
        });

        const headerRow = DESCRIPTION_ROW + description.length + HEADER_GAP;

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
