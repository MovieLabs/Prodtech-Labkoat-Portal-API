/**
 * What a view's on-screen table shows, and in what order.
 *
 * ## Not an export profile, though it looks like one
 *
 * It names columns by the same `source` the export catalogue uses — `id`, `definition`,
 * `label:acronym` — so the two are configured from one list and a reader choosing a column sees the
 * same names in both places. It is kept apart from `view.export` all the same, because the
 * questions differ: an export asks how to *serialise* a vocabulary, and answers `split`,
 * `delimiter` and one profile per format. A table on a screen has none of those.
 *
 * ## The default is here, not in the client
 *
 * The same rule the export profiles follow: a view that has never been configured still shows
 * something, and a client opening on its own guess writes a narrower list the moment somebody
 * presses Save.
 *
 * @module vocabulary/tableConfig
 */

import { isField } from './fields.js';

/**
 * What the table shows before anybody configures it.
 *
 * Six columns, which is what the editor drew when the list was fixed — with one difference. There
 * was an `Alternate Label` column lumping every non-preferred label into one cell as
 * `Message Bus (synonym), MsgSys (abbreviation)`. The catalogue has no source for that, deliberately:
 * a column is a stated property rather than a bag of them, so a vocabulary wanting its synonyms on
 * screen adds `label:synonym` and gets a column that can be sorted and filtered like any other.
 *
 * @type {{columns: Array<{source: string, header: string}>}}
 */
export const DEFAULT_TABLE = {
    columns: [
        { source: 'label:pref', header: 'Preferred Label' },
        { source: 'status', header: 'Status' },
        { source: 'definition', header: 'Definition' },
        { source: 'collections', header: 'Collections' },
        { source: 'broader', header: 'Broader' },
        { source: 'id', header: 'Identifier' },
    ],
};

/**
 * What a view's table shows, defaults resolved.
 *
 * `columns` replaces rather than merges: an author who has listed columns means that list, and a
 * merge would reinstate ones they had removed.
 *
 * @param {object} view - The view document, as stored
 * @returns {{columns: Array<{source: string, header: string}>}}
 */
export function tableFor(view) {
    const held = view?.table;
    if (!held?.columns) return DEFAULT_TABLE;
    return { ...DEFAULT_TABLE, ...held };
}

/**
 * Check a table configuration before it is written.
 *
 * Every reason is collected rather than the first thrown, because a caller fixing three mistakes
 * one round trip at a time is doing three times the work.
 *
 * @param {object} config
 * @param {Array<object>} facetDocs - The controlled sets, which half the catalogue comes from
 * @returns {{ok: boolean, errors: string[]}}
 */
export function validateTableConfig(config, facetDocs = []) {
    const errors = [];

    if (!config || typeof config !== 'object' || Array.isArray(config)) {
        return { ok: false, errors: ['A table configuration must be an object'] };
    }

    if (!Array.isArray(config.columns)) {
        errors.push('`columns` must be an array');
        return { ok: false, errors };
    }

    // A table with no columns is not a narrower table, it is a blank one — and it looks exactly
    // like a load that failed.
    if (!config.columns.length) {
        errors.push('A table needs at least one column');
    }

    const seen = new Set();
    config.columns.forEach((column, at) => {
        const where = `Column ${at + 1}`;
        if (!column || typeof column !== 'object') {
            errors.push(`${where} must be an object with a source and a header`);
            return;
        }
        if (typeof column.source !== 'string' || !column.source) {
            errors.push(`${where} has no source`);
            return;
        }
        if (!isField(column.source, facetDocs)) {
            errors.push(`${where}: "${column.source}" is not something this vocabulary can show. Ask GET /export/fields for the list.`);
        }
        // Two columns of one source are two columns saying the same thing, and only one of them can
        // be the one somebody meant to rename.
        if (seen.has(column.source)) {
            errors.push(`${where}: "${column.source}" is already a column`);
        }
        seen.add(column.source);
        if (column.header !== undefined && typeof column.header !== 'string') {
            errors.push(`${where}: a header must be text`);
        }
    });

    return { ok: !errors.length, errors };
}
