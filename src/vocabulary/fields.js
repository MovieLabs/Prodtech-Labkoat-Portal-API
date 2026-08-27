/** * What a column can hold, and how it is filled.
 *
 * A tabular profile names its columns by a **source** — `id`, `definition`, `label:acronym`. This
 * module owns both halves of that: which sources exist, and what each one produces for a term.
 *
 * ## A source is written the way the model is
 *
 * `label:acronym`, `note:editorial`, `example:url`, `tag:departmentOrRole`. The prefix is the array
 * on the term and the suffix is the type within it, so a source says where its value comes from
 * without anybody having to learn a second vocabulary for it.
 *
 * **Every typed source names a type the controlled set declares, and nothing else.** There were
 * aggregates once — `label:*` for every non-preferred label at once, with `labelType:*` giving their
 * kinds in a parallel column — carried over from the CSV the hardcoded exporter produced. They are
 * gone: a reader choosing columns should see the label types this vocabulary has, and an entry
 * standing for "the others, lumped together" is not one of them.
 *
 * A source that is not one of the typed arrays is written plainly: `id`, `status`, `broader`. There
 * is no source for the name a view renders a term under — the dotted compound the graph draws. It
 * was offered as `displayLabel` and is not a thing the model has: a term has labels, of the types
 * the controlled set declares, and nothing else.
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

import { broaderOf, displayName, schemeHeads, schemesOf, tagsFor } from './resolve.js';
import { derivedLabel, labelOfType, localised, prefLabel } from './store/read.js';

/**
 * Scheme identifier to the preferred label of the term heading it.
 *
 * A scheme id is derived (`vmc:c-0001a7` heads `vmc:s-0001a7`) and legible to nobody, so a column of
 * them says nothing a reader can use. Cached per resolution because every row asks, and the answer
 * is the same for all of them.
 *
 * @type {WeakMap<object, Map<string, string>>}
 */
const schemeLabelCache = new WeakMap();

/**
 * @param {object} resolution
 * @param {string} language
 * @returns {Map<string, string>}
 */
function schemeLabels(resolution, language) {
    const held = schemeLabelCache.get(resolution);
    if (held) return held;

    const labels = new Map();
    schemeHeads(resolution).forEach((schemeId, termId) => {
        const head = resolution.terms.get(termId);
        // The identifier only where the head is missing, which means a term was deleted while a view
        // still attached it — a state worth seeing rather than blanking.
        labels.set(schemeId, head ? prefLabel(head, language) : schemeId);
    });

    schemeLabelCache.set(resolution, labels);
    return labels;
}

/** A tag source names its set without repeating the `facet:` its identifier already carries. */
const tagSlug = ((facetId) => String(facetId).replace(/^facet:/, ''));

/**
 * The sources that exist whatever the controlled sets say.
 *
 * `heading` is what a column of this becomes in an export unless somebody renames it, and `describes`
 * is what the source means, for a reader choosing between thirty of them. Neither is a second name
 * for the source — the source names itself.
 *
 * @type {Array<{source: string, describes: string, group: string, multi: boolean}>}
 */
const STRUCTURAL = [
    { source: 'id', heading: 'id', describes: 'The term identifier', group: 'Structure', multi: false },
    { source: 'definition', heading: 'definition', describes: 'The definition', group: 'Structure', multi: false },
    { source: 'status', heading: 'status', describes: 'The term status', group: 'Structure', multi: false },
    { source: 'scheme', heading: 'scheme', describes: 'The schemes it is published under, by label', group: 'Structure', multi: true },
    { source: 'collections', heading: 'collections', describes: 'Collections using it', group: 'Structure', multi: true },
    { source: 'broader', heading: 'broader', describes: 'The term it sits under', group: 'Structure', multi: true },
    { source: 'placements', heading: 'placements', describes: 'How many times it is placed', group: 'Structure', multi: false },
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
                // The set's own heading, which is the one the sets editor shows beside each value.
                heading: facet.label?.en ?? tagSlug(facet._id),
                describes: facet.definition?.en ?? facet.label?.en ?? facet._id,
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
                // **The set decides.** A value's heading in the controlled set is what a column of
                // it is called by default, so renaming one there renames it in every export that
                // has not overridden it — which is what makes that column worth its name.
                heading: value.label?.en ?? type,
                describes: `${facet.label?.en ?? facet.appliesTo}: ${value.label?.en ?? type}`,
                group: { label: 'Labels', note: 'Notes', example: 'Examples' }[facet.appliesTo],
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
 * @param {Array<object>} context.facets - Needed by `tag:<set>`, to know which values are that
 *   set's. The resolution does not carry them
 * @param {string} context.language
 * @returns {Array<string>}
 */
export function valueAt(source, { term, placements, resolution, facets = [], language }) {
    const unique = ((values) => [...new Set(values.filter((value) => value !== null && value !== undefined && value !== ''))]);

    switch (source) {
        case 'id': return [term._id];
        case 'definition': return [localised(term.definition, language) ?? ''];
        case 'status': return [term.status ?? ''];
        case 'scheme': {
            const labels = schemeLabels(resolution, language);
            return unique(placements.flatMap((placement) => schemesOf(placement))
                .map((schemeId) => labels.get(schemeId) ?? schemeId));
        }
        case 'collections': return unique(placements.map((placement) => placement.collectionId));
        case 'broader': return unique(placements.map((placement) => broaderOf(placement)));
        case 'placements': return [String(placements.length)];

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
        const view = resolution?.view ?? {};
        const names = view.labelType ?? 'pref';

        // **The column holding the label this view names terms by is rendered the way the view
        // renders it** — joined to its ancestors' where the view is dotted, giving
        // `assetFunction.capture` rather than `capture`.
        //
        // The same call the graph draws from, so the two cannot disagree: `labelStyle` says once
        // whether this view's names are compound, and both the canvas and the export read it. A
        // per-column setting would be a second place to say it, and the place that goes stale.
        //
        // One value per placement, because a term placed twice sits under two paths. Any other
        // label type is the term's own and has no compound form — a synonym is a synonym wherever
        // the term appears.
        if ((type || 'pref') === names) {
            return unique(placements.map((placement) => displayName(
                placement, resolution.terms, view.labelStyle ?? 'plain', names, language,
            )));
        }

        // Exactly one preferred label per language is an invariant the whole label array rests on,
        // so that one is asked for by name.
        if (!type || type === 'pref') return [labelOfType(term, 'pref', language)];

        // **Every label of the type, not the first.** A term with three synonyms has three, and
        // `labelOfType` answers "what does this view call it" — one value — which is the wrong
        // question for a column that states what the term carries. Notes and examples already did
        // this; labels were the one that quietly published the first and dropped the rest.
        const carried = (term?.label ?? [])
            .filter((entry) => entry.labelType === type)
            .filter((entry) => !entry.language || entry.language === language)
            .map((entry) => entry.value)
            .filter(Boolean);
        if (carried.length) return carried;

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
