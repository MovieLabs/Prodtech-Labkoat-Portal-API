/**
 * What a column can hold, and how it is filled.
 *
 * A tabular profile names its columns by a **source** — `id`, `definition`, `label:acronym`. This
 * module owns both halves of that: which sources exist, and what each one produces for a term.
 *
 * ## Why the catalogue is computed and served
 *
 * Half the sources are not knowable in advance. `label:acronym` exists because somebody added
 * *acronym* to the label set; adding *trade name* tomorrow has to make `label:tradeName` selectable
 * with no deploy of anything. So the catalogue is derived from the facets and handed to clients,
 * rather than restated in each of them — the same rule that keeps the controlled sets the only place
 * a type is declared.
 *
 * ## Every source returns an array
 *
 * Even the single-valued ones. A tabular format joins them with the profile's separator, a workbook
 * might not, and a caller that receives a string cannot tell an empty cell from a term with no
 * acronym. Joining is a formatting decision and belongs to the format.
 *
 * @module vocabulary/fields
 */

import { broaderOf, schemesOf, tagsFor } from './resolve.js';
import { derivedLabel, hasLabelOfType, labelOfType, localised, otherLabels } from './store/read.js';

/**
 * The sources that exist whatever the controlled sets say.
 *
 * `display` is the name this view publishes the term under — dotted or plain, per the view — which
 * is what a consumer of a controlled value actually uses. It is not the same as the preferred label
 * and the difference is the whole point of a dotted view.
 *
 * @type {Array<{source: string, label: string, group: string, multi: boolean}>}
 */
const STRUCTURAL = [
    { source: 'id', label: 'Identifier', group: 'Identity', multi: false },
    { source: 'display', label: 'Published name', group: 'Identity', multi: true },
    { source: 'definition', label: 'Definition', group: 'Content', multi: false },
    { source: 'status', label: 'Status', group: 'Content', multi: false },
    { source: 'labels', label: 'Other names', group: 'Names', multi: true },
    { source: 'labelTypes', label: 'Other name kinds', group: 'Names', multi: true },
    { source: 'notes', label: 'All notes', group: 'Content', multi: true },
    { source: 'noteTypes', label: 'Note kinds', group: 'Content', multi: true },
    { source: 'examples', label: 'All examples', group: 'Content', multi: true },
    { source: 'exampleTypes', label: 'Example kinds', group: 'Content', multi: true },
    { source: 'scheme', label: 'Scheme', group: 'Structure', multi: true },
    { source: 'container', label: 'Arrangements placing it', group: 'Structure', multi: true },
    { source: 'broader', label: 'Sits under', group: 'Structure', multi: true },
    { source: 'placements', label: 'Times placed', group: 'Structure', multi: false },
    { source: 'tags', label: 'All tags', group: 'Tags', multi: true },
];

/**
 * Every source a column may name, this vocabulary's own types included.
 *
 * @param {Array<object>} facetDocs - Facet documents, as stored
 * @returns {Array<{source: string, label: string, group: string, multi: boolean}>}
 */
export function fieldCatalogue(facetDocs = []) {
    const typed = facetDocs.flatMap((facet) => {
        // A tag set contributes one column carrying that set's values, because two sets sharing a
        // value are two different designations and one column cannot say which was meant.
        if (facet.appliesTo === 'tag') {
            return [{
                source: `tag:${facet._id}`,
                label: `Tag — ${facet.label?.en ?? facet._id}`,
                group: 'Tags',
                multi: true,
            }];
        }

        const prefix = { label: 'label', note: 'note', example: 'example' }[facet.appliesTo];
        if (!prefix) return [];

        return (facet.values ?? []).map((value) => {
            const type = value[facet.key];
            return {
                source: `${prefix}:${type}`,
                label: `${value.label?.en ?? type}`,
                group: { label: 'Names', note: 'Notes', example: 'Examples' }[facet.appliesTo],
                multi: true,
            };
        });
    });

    return [...STRUCTURAL, ...typed];
}

/** Whether a source is one this vocabulary offers. */
export const isField = ((source, facetDocs) => fieldCatalogue(facetDocs)
    .some((entry) => entry.source === source));

/**
 * What a source produces for one term.
 *
 * @param {string} source
 * @param {object} context
 * @param {object} context.term - The term document
 * @param {Array<object>} context.placements - The placements this row covers. One for a placement
 *   row; every placement of the term for a term row
 * @param {object} context.resolution
 * @param {Array<object>} context.facets - Needed by `tag:<facetId>`, to know which values are that
 *   set's. The resolution does not carry them
 * @param {string} context.language
 * @returns {Array<string>}
 */
export function valueAt(source, { term, placements, resolution, facets = [], language }) {
    const unique = ((values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))]);

    switch (source) {
        case 'id': return [term._id];
        case 'display': return unique(placements.map((placement) => placement.display));
        case 'definition': return [localised(term.definition, language) ?? ''];
        case 'status': return [term.status ?? ''];
        case 'labels': return otherLabels(term).map((entry) => entry.value);
        case 'labelTypes': return otherLabels(term).map((entry) => entry.labelType);
        case 'notes': return (term.note ?? []).map((entry) => entry.value);
        case 'noteTypes': return (term.note ?? []).map((entry) => entry.noteType);
        case 'examples': return (term.example ?? []).map((entry) => entry.value);
        case 'exampleTypes': return (term.example ?? []).map((entry) => entry.exampleType);
        case 'scheme': return unique(placements.flatMap((placement) => schemesOf(placement)));
        case 'container': return unique(placements.map((placement) => placement.collectionId));
        case 'broader': return unique(placements.map((placement) => broaderOf(placement)));
        case 'placements': return [String(placements.length)];
        case 'tags': return tagsFor(resolution, term._id);
        default: break;
    }

    const [prefix, type] = source.split(/:(.*)/s);

    // **A column is a stated property, not a name, and the difference matters here.**
    // `labelOfType` falls back to the preferred label, because everywhere it is normally used a
    // term *must* end up called something. A column headed `Acronym` is a claim about the term, so
    // that same fallback would fill it with full names for every term carrying no acronym — which
    // is not a gap in the data but a false statement about it.
    //
    // Derivation is kept, because a derived `omcToken` is genuinely that term's token; only the
    // fallback to the preferred name is dropped.
    if (prefix === 'label') {
        if (!type || type === 'pref') return [labelOfType(term, 'pref', language)];
        if (hasLabelOfType(term, type)) return [labelOfType(term, type, language)];
        const derived = derivedLabel(term, type);
        return derived ? [derived] : [];
    }
    if (prefix === 'note') {
        return (term.note ?? []).filter((entry) => entry.noteType === type).map((entry) => entry.value);
    }
    if (prefix === 'example') {
        return (term.example ?? []).filter((entry) => entry.exampleType === type).map((entry) => entry.value);
    }
    if (prefix === 'tag') {
        const facet = facets.find((entry) => entry._id === type);
        if (!facet) return [];
        const allowed = new Set((facet.values ?? []).map((value) => value[facet.key]));
        return tagsFor(resolution, term._id).filter((tag) => allowed.has(tag));
    }

    // An unknown source is refused at the point a profile is saved, so reaching here means a set
    // value was removed after the fact. Empty rather than thrown: one blank column is a better
    // answer than no export at all, and it is reported alongside.
    return [];
}
