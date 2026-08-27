/**
 * A resolved view as tables.
 *
 * CSV, XLSX and Markdown differ only in how a table is written down — the decisions that produce
 * one are the same for all three, so they are made once here. What each format still owns is its
 * own syntax: quoting, sheets, pipes.
 *
 * ## Hierarchy is not expressed, deliberately
 *
 * A row has no depth and no indentation. A vocabulary is a graph — a term sits in several
 * arrangements at once — and every way of drawing that in a flat table either repeats the term
 * until it is unreadable or picks one position and lies about the rest. So structure is carried as
 * *data* instead, in whatever columns the profile asks for: `scheme`, `broader`, `display` for the
 * dotted path. A reader who wants the shape sorts on those; nobody is misled by an indent that
 * shows one of three homes.
 *
 * @module vocabulary/generators/rows
 */

import { valueAt } from '../fields.js';
import { placementsByTerm, schemeHeads, schemesOf } from '../resolve.js';
import { prefLabel } from '../store/read.js';

/** What a group of rows is called when the profile does not split. */
const ALL = 'all';

/**
 * Group the rows a view produces, ready for a format to write down.
 *
 * @param {object} resolution
 * @param {object} profile
 * @param {Array<object>} facets
 * @returns {{groups: Array<{key: string, name: string, head: (object|null),
 *   rows: Array<Array<string[]>>}>, columns: Array<{source: string, header: string}>,
 *   problems: object}}
 */
export function buildRows(resolution, profile, facets = []) {
    const { language } = resolution;
    const columns = profile.columns ?? [];
    const perPlacement = profile.rows === 'placement';

    // Each entry is the term and the placements the row speaks for: every placement of the term when
    // rows are terms, and exactly one when rows are placements. That difference is the whole of the
    // grain setting — everything downstream reads `placements` and does not care which it got.
    const entries = [];
    if (perPlacement) {
        resolution.placements.forEach((placement) => {
            const term = resolution.terms.get(placement.termId);
            if (term) entries.push({ term, placements: [placement] });
        });
    } else {
        placementsByTerm(resolution).forEach((placements, termId) => {
            const term = resolution.terms.get(termId);
            if (term) entries.push({ term, placements });
        });
    }

    // Sorted by the term's preferred name so a diff between two exports is readable. Unsorted output
    // reorders whenever Mongo feels like it and every line then reads as changed.
    //
    // **By the preferred label, not by the published one.** A dotted view renders `capture.audio`,
    // which would sort every branch under its parent's name and scatter the alphabet; and this is
    // what the hardcoded CSV sorted by, which the golden files hold this to.
    entries.sort((a, b) => prefLabel(a.term, language).localeCompare(prefLabel(b.term, language)));

    const cellsFor = ((entry) => columns.map((column) => valueAt(column.source, {
        term: entry.term,
        placements: entry.placements,
        resolution,
        facets,
        language,
    })));

    if (profile.split !== 'per-scheme') {
        return {
            groups: [{
                key: ALL,
                name: resolution.view?._id ?? ALL,
                head: null,
                rows: entries.map(cellsFor),
            }],
            columns,
            problems: {},
        };
    }

    // One table per scheme. A term in two schemes is in both tables — that is the vocabulary saying
    // something true twice, the same way SKOS emits it twice, not a duplicate to be removed.
    const heads = schemeHeads(resolution);
    const nameOf = new Map();
    const headOf = new Map();
    heads.forEach((schemeId, termId) => {
        const head = resolution.terms.get(termId);
        nameOf.set(schemeId, head ? prefLabel(head, language) : schemeId);
        // The term the scheme is derived from, so a format with room to present it can read its
        // labels and notes. A workbook heads each sheet with them.
        if (head) headOf.set(schemeId, head);
    });

    const grouped = new Map();
    const unscoped = [];

    entries.forEach((entry) => {
        const schemes = [...new Set(entry.placements.flatMap((placement) => schemesOf(placement)))];
        if (!schemes.length) {
            // A view can publish terms that sit under no scheme at all — one built entirely of
            // groupings has no scheme heads, and every row would vanish if these were dropped.
            unscoped.push(entry);
            return;
        }
        schemes.forEach((schemeId) => {
            if (!grouped.has(schemeId)) grouped.set(schemeId, []);
            grouped.get(schemeId).push(entry);
        });
    });

    const groups = [...grouped.entries()].map(([schemeId, group]) => ({
        key: schemeId,
        name: nameOf.get(schemeId) ?? schemeId,
        head: headOf.get(schemeId) ?? null,
        rows: group.map(cellsFor),
    }));

    if (unscoped.length) {
        // No head, because there is no scheme — these are the terms the view publishes outside one.
        groups.push({ key: 'unscoped', name: 'Ungrouped', head: null, rows: unscoped.map(cellsFor) });
    }

    return {
        groups,
        columns,
        // Said rather than left to be noticed. A split export that produced one table is usually a
        // view with no scheme heads, which looks identical to a broken split once it is downloaded.
        problems: groups.length ? {} : { noSchemes: 1 },
    };
}

/**
 * A group's rows as text, each cell's values joined.
 *
 * Joining is a formatting decision, which is why `valueAt` hands back arrays and this is separate:
 * a workbook may want to do something else with a cell holding four values.
 *
 * @param {Array<Array<string[]>>} rows
 * @param {string} multi
 * @returns {Array<string[]>}
 */
export const joinCells = ((rows, multi) => rows
    .map((row) => row.map((values) => values.join(multi))));
