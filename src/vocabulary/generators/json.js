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

import { overlayFor, schemesOf, tagsFor, topConceptOf } from '../resolve.js';
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

    const overlay = overlayFor(resolution, placement.termId);
    if (Object.keys(overlay).length) entry.properties = overlay;

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

    // Rebuild the nesting from the flat list. A placement's parent is the last entry in its path,
    // whether that is a term or a collection, so one pass keyed on that gives the whole tree.
    const nodesByMid = new Map();
    const collectionNodes = new Map();

    const collectionNode = ((id) => {
        if (collectionNodes.has(id)) return collectionNodes.get(id);
        const collection = resolution.collections.get(id);
        const entry = {
            id,
            kind: 'collection',
            label: prefLabel(collection, language),
            definition: localised(collection?.definition, language),
            skosAs: collection?.skosAs ?? 'collection',
            children: [],
        };
        collectionNodes.set(id, entry);
        return entry;
    });

    const roots = [];

    resolution.placements.forEach((placement) => {
        const entry = node(resolution, placement);
        entry.kind = 'term';
        nodesByMid.set(`${placement.collectionId}/${placement.mid}`, entry);

        const parent = placement.path[placement.path.length - 1];
        if (!parent) {
            roots.push(entry);
            return;
        }
        if (parent.kind === 'term') {
            // The parent term's own placement shares this path minus its last entry. Found by id
            // rather than by mid because a promoted child's parent may be in another collection.
            const parentEntry = [...nodesByMid.values()].find((candidate) => candidate.id === parent.id);
            (parentEntry ?? { children: roots }).children.push(entry);
            return;
        }
        const collection = resolution.collections.get(parent.id);
        if ((collection?.skosAs ?? 'collection') === 'transparent') {
            roots.push(entry);
            return;
        }
        collectionNode(parent.id).children.push(entry);
    });

    // Collections that hold something, hung under the root. A transparent one contributes no node,
    // so its children were already promoted above.
    collectionNodes.forEach((entry) => {
        if (entry.children.length) roots.push(entry);
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
