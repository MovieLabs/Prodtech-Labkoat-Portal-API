/**
 * A view as a shaped JSON document.
 *
 * Deliberately **not** the resolution this service works in. A consumer that reads the internal
 * shape is coupled to how resolution happens to be implemented; this is a document with a stated
 * shape that can stay stable while the inside changes.
 *
 * Nested, because a taxonomy read by a person or drawn by a UI wants nesting, and because the flat
 * placement list exists precisely so the nesting can be rebuilt to order.
 *
 * @module vocabulary/generators/json
 */

import {
    schemeHeads, schemesOf, tagsFor, topConceptOf,
} from '../resolve.js';
import { localised, otherLabels, prefLabel } from '../store/read.js';

/**
 * One term, as this view presents it.
 *
 * Labels keep their types — that is the whole point of the model, and flattening them here would
 * throw away in the output the distinction the store went to trouble to record.
 *
 * @param {object} resolution
 * @param {object} placement
 * @returns {object}
 */
function node(resolution, placement) {
    const term = resolution.terms.get(placement.termId);
    const { language } = resolution;

    const entry = {
        id: placement.termId,
        label: placement.display,
        prefLabel: prefLabel(term, language),
        definition: localised(term.definition, language),
        status: term.status,
        // Which collection *declares* this placement, as distinct from the schemes enclosing it.
        // An editor forking a term needs this: a fork repoints one collection's placements and
        // leaves every other collection on the original, so it has to name the right one.
        collection: placement.collectionId,
        mid: placement.mid,
        children: [],
    };

    const alternates = otherLabels(term);
    if (alternates.length) {
        entry.labels = alternates.map((label) => ({
            value: label.value,
            type: label.labelType,
            language: label.language,
        }));
    }

    if (term.note?.length) {
        entry.notes = term.note.map((n) => ({ value: n.value, type: n.noteType, language: n.language }));
    }
    if (term.example?.length) {
        entry.examples = term.example.map((e) => ({ value: e.value, type: e.exampleType, language: e.language }));
    }

    const tags = tagsFor(resolution, placement.termId);
    if (tags.length) entry.tags = tags;

    const schemes = schemesOf(placement);
    if (schemes.length) entry.inCollections = schemes;

    const tops = topConceptOf(placement);
    if (tops.length) entry.topOf = tops;

    return entry;
}

/**
 * The view as a nested document.
 *
 * @param {object} resolution
 * @returns {object}
 */
export function toViewJson(resolution) {
    const { view, language } = resolution;

    // Rebuild the nesting from the flat list. Every path entry is a term, so a placement's parent is
    // simply the last one and a single pass gives the whole tree.
    //
    // **Keyed by the path, not by the term id.** A term sits in several places, and its children
    // belong under the copy they were declared beneath; keying by id alone gathers all of them under
    // whichever copy happened to be built first. The one case a path cannot separate — two
    // placements of one term under one parent — is the same ambiguity the editor's published tree
    // documents, and it is rare enough to state rather than solve.
    const byPath = new Map();
    const roots = [];
    const heads = schemeHeads(resolution);

    const pathKey = ((entries) => entries.map((entry) => entry.id).join('>'));

    resolution.placements.forEach((placement) => {
        const entry = node(resolution, placement);
        entry.kind = 'term';
        // The vocabulary this term heads, where a view attaches it. A consumer reading the JSON gets
        // the same answer the SKOS gives without having to know how the identifier is derived.
        if (!placement.path.length && heads.has(placement.termId)) {
            entry.scheme = heads.get(placement.termId);
        }
        byPath.set(pathKey([...placement.path, { id: placement.termId }]), entry);

        const parent = placement.path.length ? byPath.get(pathKey(placement.path)) : null;
        (parent ?? { children: roots }).children.push(entry);
    });

    return {
        view: {
            id: view._id,
            label: prefLabel(view, language),
            definition: localised(view.definition, language),
            labelStyle: view.labelStyle ?? 'plain',
            status: resolution.status,
        },
        generated: null, // Stamped by the caller; this module must stay deterministic
        // Two counts, because they differ and the difference is the point of the model: a term in
        // three collections is one term and three placements. Reporting only the larger reads as
        // more vocabulary than there is; only the smaller hides the reuse.
        terms: new Set(resolution.placements.map((placement) => placement.termId)).size,
        placements: resolution.placements.length,
        tree: roots,
    };
}
