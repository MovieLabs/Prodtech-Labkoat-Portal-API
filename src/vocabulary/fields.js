/**
 * What a column can hold, and how it is filled.
 *
 * A tabular profile names its columns by a **source** — `id`, `definition`, `label:acronym`. This
 * module owns both halves of that: which sources exist, and what each one produces for a term.
 *
 * ## A source is written the way the model is
 *
 * `label:acronym`, `note:editorial`, `example:url`, `tag:departmentOrRole`. The prefix is the array
 * on the term and the suffix is the type within it, so a source says where its value comes from
 * without anybody having to learn a second vocabulary for it. `label:*` is every label of that kind
 * — the aggregate the spreadsheet round trip has always carried — and `labelType:*` is their kinds,
 * in the same order.
 *
 * A source that is not one of the typed arrays is written plainly: `id`, `status`, `broader`.
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

/** A tag source names its set without repeating the `facet:` its identifier already carries. */
const tagSlug = ((facetId) => String(facetId).replace(/^facet:/, ''));

/**
 * The sources that exist whatever the controlled sets say.
 *
 * `describes` is what the source means, for a reader choosing between thirty of them. It is not a
 * second name for the source — the source names itself.
 *
 * @type {Array<{source: string, describes: string, group: string, multi: boolean}>}
 */
const STRUCTURAL = [
    { source: 'id', describes: 'The term identifier', group: 'Term', multi: false },
    {
        source: 'displayLabel',
        // Not a stored field and not a label type: it is whichever label type the *view* publishes,
        // joined to its ancestors where the view is dotted. That join is why it cannot simply be
        // `label:<something>` — the value depends on where the term sits, not only on the term.
        describes: 'The label this view publishes, dotted if the view is',
        group: 'Term',
        multi: true,
    },
    { source: 'definition', describes: 'The definition', group: 'Term', multi: false },
    { source: 'status', describes: 'The term status', group: 'Term', multi: false },
    { source: 'scheme', describes: 'The schemes it is published under', group: 'Structure', multi: true },
    { source: 'collections', describes: 'Collections using it', group: 'Structure', multi: true },
    { source: 'broader', describes: 'The term it sits under', group: 'Structure', multi: true },
    { source: 'placements', describes: 'How many times it is placed', group: 'Structure', multi: false },
];

/**
 * The aggregates, one per typed array.
 *
 * These are what the spreadsheet round trip has always carried: every non-preferred label in one
 * cell and their kinds in another. They are a spreadsheet convenience rather than anything the model
 * holds, which is why they are written `label:*` — plainly an aggregate over the same array a
 * `label:acronym` picks one from.
 */
const AGGREGATES = [
    { source: 'label:*', describes: 'Every label except the preferred one', group: 'Labels', multi: true },
    { source: 'labelType:*', describes: 'Their label types, in the same order', group: 'Labels', multi: true },
    { source: 'note:*', describes: 'Every note', group: 'Notes', multi: true },
    { source: 'noteType:*', describes: 'Their note types, in the same order', group: 'Notes', multi: true },
    { source: 'example:*', describes: 'Every example', group: 'Examples', multi: true },
    { source: 'exampleType:*', describes: 'Their example types, in the same order', group: 'Examples', multi: true },
    { source: 'tag:*', describes: 'Every tag this view gives it', group: 'Tags', multi: true },
];

/**
 * Every source a column may name, this vocabulary's own types included.
 *
 * @param {Array<object>} facetDocs - Facet documents, as stored
 * @returns {Array<{source: string, describes: string, group: string, multi: boolean}>}
 */
export function fieldCatalogue(facetDocs = []) {
    const typed = facetDocs.flatMap((facet) => {
        // A tag set contributes one column carrying that set's values, because two sets sharing a
        // value are two different designations and one column cannot say which was meant.
        if (facet.appliesTo === 'tag') {
            return [{
                source: `tag:${tagSlug(facet._id)}`,
                describes: facet.label?.en ?? facet._id,
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
                describes: value.label?.en ?? type,
                group: { label: 'Labels', note: 'Notes', example: 'Examples' }[facet.appliesTo],
                multi: true,
            };
        });
    });

    // Typed before aggregate within each group, so a picker reads `label:acronym` … `label:*` —
    // the specific things first and the catch-all last, which is the order somebody looks in.
    return [...STRUCTURAL, ...typed, ...AGGREGATES];
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
 * @param {Array<object>} context.facets - Needed by `tag:<set>`, to know which values are that
 *   set's. The resolution does not carry them
 * @param {string} context.language
 * @returns {Array<string>}
 */
export function valueAt(source, { term, placements, resolution, facets = [], language }) {
    const unique = ((values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))]);

    switch (source) {
        case 'id': return [term._id];
        case 'displayLabel': return unique(placements.map((placement) => placement.display));
        case 'definition': return [localised(term.definition, language) ?? ''];
        case 'status': return [term.status ?? ''];
        case 'scheme': return unique(placements.flatMap((placement) => schemesOf(placement)));
        case 'collections': return unique(placements.map((placement) => placement.collectionId));
        case 'broader': return unique(placements.map((placement) => broaderOf(placement)));
        case 'placements': return [String(placements.length)];

        case 'label:*': return otherLabels(term).map((entry) => entry.value);
        case 'labelType:*': return otherLabels(term).map((entry) => entry.labelType);
        case 'note:*': return (term.note ?? []).map((entry) => entry.value);
        case 'noteType:*': return (term.note ?? []).map((entry) => entry.noteType);
        case 'example:*': return (term.example ?? []).map((entry) => entry.value);
        case 'exampleType:*': return (term.example ?? []).map((entry) => entry.exampleType);
        case 'tag:*': return tagsFor(resolution, term._id);
        default: break;
    }

    const [prefix, type] = source.split(/:(.*)/s);

    // **A column is a stated property, not a name, and the difference matters here.**
    // `labelOfType` falls back to the preferred label, because everywhere it is normally used a
    // term *must* end up called something. A column headed `Acronym` is a claim about the term, so
    // that same fallback would fill it with preferred labels for every term carrying no acronym —
    // which is not a gap in the data but a false statement about it.
    //
    // Derivation is kept, because a derived `omcToken` is genuinely that term's token; only the
    // fallback to the preferred label is dropped.
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
        const facet = facets.find((entry) => tagSlug(entry._id) === type);
        if (!facet) return [];
        const allowed = new Set((facet.values ?? []).map((value) => value[facet.key]));
        return tagsFor(resolution, term._id).filter((tag) => allowed.has(tag));
    }

    // An unknown source is refused at the point a profile is saved, so reaching here means a set
    // value was removed after the fact. Empty rather than thrown: one blank column is a better
    // answer than no export at all, and it is reported alongside.
    return [];
}
