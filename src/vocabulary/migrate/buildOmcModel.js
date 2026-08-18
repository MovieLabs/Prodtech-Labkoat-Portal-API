/**
 * Merge the OMC-JSON graph into the one term store.
 *
 * ## What this actually does
 *
 * Two graphs, joined by an integrity-free string, become **one term store with two collections over
 * it**. That sentence is the whole of Stage 5, and everything here serves it:
 *
 * - A controlled value carrying a `hasSkosDefinition` edge is **not a new thing**. It is a placement
 *   of a term the vocabulary already holds. Its member points at that term, and the two graphs stop
 *   being two.
 * - A controlled value carrying none is a term nobody had written down. It is minted, keeping the
 *   OMC identifier so a re-run finds it again and so its provenance is legible in every artifact.
 * - Either way the term gains an **`omcToken` label**: the name OMC-JSON uses, which is not the name
 *   a reader uses. `Audio` and `audio` are the same term and different strings, and a schema breaks
 *   on the difference.
 *
 * The arrangement is a collection per property that owns controlled values, nested by `hasSubValue`.
 * The dotted name falls out of that nesting rather than being stored: `capture` with
 * `witnessCamera` beneath it renders as `capture.witnessCamera`, which is the string the schema
 * holds.
 *
 * ## What is deliberately not done
 *
 * **The SKOS-migrated terms are not rewritten.** This adds a label to some of them and changes
 * nothing else — not their definitions, not their status, not their placements. A controlled value
 * whose definition disagrees with the term's is reported, not resolved: the vocabulary is the
 * authority on meaning, and OMC's copy of a definition is a copy.
 *
 * @module vocabulary/migrate/buildOmcModel
 */

import { DEFAULT_LANGUAGE } from '../store/read.js';

import { indexOmcEdges, isKind, omcRelatedTo } from './readOmcGraph.js';

/** The collection every property collection hangs under. */
export const OMC_ROOT = 'coll:omc-controlled-values';

/** The label type carrying the name OMC-JSON uses. */
export const OMC_TOKEN = 'omcToken';

/**
 * The collection id for one property's values.
 *
 * Built from the OMC identifier, not from the label. Six different properties are called
 * `narrativeType`, and a label-derived id would collapse them into one.
 *
 * @param {string} omcId
 * @returns {string}
 */
export const omcCollectionId = ((omcId) => `coll:omc-${omcId.replace(/^omc:/, '')}`);

/**
 * What a property is called, qualified by whatever owns it.
 *
 * `narrativeType` alone names six different tables. `NarrativeObject.narrativeType` names one, and
 * it is also how anyone reading the schema would refer to it.
 *
 * @param {object} graph
 * @param {Map<string, Array<object>>} out - The outgoing-edge index from `indexOmcEdges`
 * @param {string} propertyId
 * @returns {string}
 */
function qualifiedName(graph, out, propertyId) {
    const property = graph.nodes.get(propertyId);
    const own = property?.label ?? propertyId;
    const owners = omcRelatedTo(out, propertyId, 'propertyOf')
        .map((id) => graph.nodes.get(id)?.label)
        .filter(Boolean);
    return owners.length ? `${owners[0]}.${own}` : own;
}

/**
 * Build a term from a controlled value that the vocabulary does not already define.
 *
 * The token is both the preferred name and the OMC token. Not redundant: the preferred name is what
 * a reader sees and can be edited to `Object Metadata` tomorrow without breaking anything, because
 * the schema reads the token. Writing only one of them would mean the first edit to a name silently
 * changed a controlled value.
 *
 * @param {object} node - The `ControlledValue` node
 * @returns {object} A term document
 */
function mintTerm(node) {
    const token = node.label ?? node.id;
    return {
        _id: node.id,
        label: [
            { value: token, language: DEFAULT_LANGUAGE, labelType: 'pref' },
            { value: token, language: DEFAULT_LANGUAGE, labelType: OMC_TOKEN },
        ],
        definition: node.definition ? { [DEFAULT_LANGUAGE]: node.definition } : {},
        note: [],
        example: [],
        status: node.status ?? 'proposed',
        // Marks what this migration owns, so a re-run replaces its own documents and leaves both
        // the SKOS migration's and anything authored by hand alone.
        omcMigrated: true,
        omcSource: node.id,
    };
}

/**
 * Which term a controlled value resolves to, and whether that term already existed.
 *
 * @param {object} graph
 * @param {object} node
 * @returns {{termId: string, existing: boolean, ambiguous: string[]|null}}
 */
function termFor(graph, node) {
    const concepts = graph.skosLinks.get(node.id) ?? [];
    if (!concepts.length) return { termId: node.id, existing: false, ambiguous: null };
    // More than one concept is a contradiction in the source, not a choice to make here. The first
    // is taken so the merge completes, and the rest are reported.
    return {
        termId: concepts[0],
        existing: true,
        ambiguous: concepts.length > 1 ? concepts : null,
    };
}

/**
 * Build the whole OMC model.
 *
 * @param {object} graph - From `readOmcGraph`
 * @param {Map<string, object>} existingTerms - The vocabulary as already stored, by id
 * @returns {object} `{ terms, collections, root, tokenPatches, report }`
 */
export function buildOmcModel(graph, existingTerms) {
    const { out } = indexOmcEdges(graph);

    const report = {
        properties: 0,
        controlledValues: 0,
        joinedToExistingTerm: 0,
        mintedNewTerm: 0,
        placements: 0,
        nested: 0,
        misfiledEdgesTreatedAsTopLevel: 0,
        unreachableValues: [],
        pointingAtMissingTerm: [],
        ambiguousLinks: [],
        definitionDisagreements: [],
    };

    /** Terms this migration mints, keyed so a value reached twice is minted once. */
    const minted = new Map();
    /** `termId → the OMC token` for terms that already exist and need the label adding. */
    const tokenPatches = new Map();
    /** Controlled value **node** ids the walk actually placed. */
    const visited = new Set();

    const collections = [];

    /**
     * Record the term a controlled value maps to, minting one where the vocabulary has none.
     *
     * @param {object} node
     * @returns {string|null} The term id, or null when it points at a term that is not there
     */
    const resolveTerm = ((node) => {
        const { termId, existing, ambiguous } = termFor(graph, node);
        if (ambiguous) report.ambiguousLinks.push({ value: node.id, concepts: ambiguous });

        if (!existing) {
            if (!minted.has(termId)) {
                minted.set(termId, mintTerm(node));
                report.mintedNewTerm += 1;
            }
            return termId;
        }

        const term = existingTerms.get(termId);
        if (!term) {
            // The edge names a concept the vocabulary does not hold — exactly the failure an
            // integrity-free string join permits. Reported and skipped: pointing a member at a term
            // that is not there would put the hole inside the new model instead of leaving it in
            // the old one.
            report.pointingAtMissingTerm.push({ value: node.id, label: node.label, concept: termId });
            return null;
        }

        report.joinedToExistingTerm += 1;
        tokenPatches.set(termId, node.label ?? termId);

        // OMC keeps its own copy of the definition. Where the two disagree the vocabulary wins —
        // it is the authority on meaning — but a disagreement is worth seeing, because one of the
        // two is out of date and nobody has been told which.
        const held = term.definition?.[DEFAULT_LANGUAGE];
        if (node.definition && held && node.definition.trim() !== held.trim()) {
            report.definitionDisagreements.push({
                term: termId, omc: node.definition, vocabulary: held,
            });
        }
        return termId;
    });

    // ---- one collection per property that owns controlled values ----

    // `hasSubValue` from a Property is a miswritten `hasControlledValue`. Eight exist, and they
    // carry `script`, `proxy`, `timeline` and `color` — four values the Asset function table needs.
    // Read as top-level rather than dropped, and counted.
    const topValuesOf = ((propertyId) => {
        const proper = omcRelatedTo(out, propertyId, 'hasControlledValue');
        const misfiled = omcRelatedTo(out, propertyId, 'hasSubValue')
            .filter((id) => !proper.includes(id));
        report.misfiledEdgesTreatedAsTopLevel += misfiled.length;
        return [...proper, ...misfiled];
    });

    const owners = [...new Set(graph.edges
        .filter((edge) => ['hasControlledValue', 'hasSubValue'].includes(edge.relation))
        .map((edge) => edge.source)
        .filter((id) => {
            const node = graph.nodes.get(id);
            return node && !isKind(node, 'ControlledValue');
        }))].sort();

    owners.forEach((propertyId) => {
        const property = graph.nodes.get(propertyId);
        const member = [];
        let counter = 0;
        const nextMid = (() => {
            counter += 1;
            return `m${counter}`;
        });

        /**
         * Place a value and everything beneath it.
         *
         * `seen` is per-branch rather than per-collection: the same value legitimately appears under
         * two different parents (`productionVehicle` sits under both `productionProp` and
         * `productionSetDressing`), and that is two placements of one term, which is the model
         * working. What it must not do is descend into itself.
         */
        const place = ((valueId, parent, seen) => {
            if (seen.has(valueId)) return;
            const node = graph.nodes.get(valueId);
            if (!node) return;

            const termId = resolveTerm(node);
            if (!termId) return;

            visited.add(valueId);
            const mid = nextMid();
            member.push({ mid, term: termId, parent });
            report.placements += 1;
            if (parent) report.nested += 1;

            // A fresh copy per child, so two branches that both reach a value each place it. Only
            // descending into a value already on *this* path is a cycle.
            const below = new Set(seen).add(valueId);
            omcRelatedTo(out, valueId, 'hasSubValue').forEach((childId) => {
                place(childId, mid, new Set(below));
            });
        });

        topValuesOf(propertyId).forEach((valueId) => place(valueId, null, new Set()));

        if (!member.length) return;

        report.properties += 1;
        collections.push({
            _id: omcCollectionId(propertyId),
            label: [{
                value: qualifiedName(graph, out, propertyId),
                language: DEFAULT_LANGUAGE,
                labelType: 'pref',
            }],
            definition: property?.definition ? { [DEFAULT_LANGUAGE]: property.definition } : {},
            // A grouping, not a scheme. These describe where a value is used in OMC-JSON, which is
            // not a claim that they form a vocabulary of their own — the vocabulary is the terms.
            skosAs: 'collection',
            member,
            omcMigrated: true,
            omcSource: propertyId,
        });
    });

    const allValues = [...graph.nodes.values()].filter((node) => isKind(node, 'ControlledValue'));
    report.controlledValues = allValues.length;

    // Value **nodes** no walk reached, not terms — the distinction matters. Two controlled values
    // can point at one term, so asking "is its term placed?" answers yes for a value that was never
    // visited itself, and the orphan hides behind its own synonym.
    const stranded = allValues.filter((node) => !visited.has(node.id));
    report.unreachableValues = stranded.map((node) => ({ id: node.id, label: node.label }));
    report.visitedValues = visited.size;

    // Gathered rather than dropped, the same way `coll:unplaced` gathers the terms no scheme
    // claimed. `wild` is one of these, and the schema wants `capture.audio.wild` — so the value is
    // real, it is the *edge* to its parent that is missing. Placing it flat makes the drift report
    // say exactly that: the vocabulary has `wild`, the schema wants `capture.audio.wild`, and
    // somebody has to reconnect it. Dropping it would report only half of that.
    const unplaced = stranded.length
        ? {
            _id: 'coll:omc-unplaced',
            label: [{ value: 'OMC Values Not Attached', language: DEFAULT_LANGUAGE, labelType: 'pref' }],
            definition: {
                en: 'Controlled values in the OMC graph that no property or parent value points at. '
                    + 'They exist and are defined; nothing says where they are used.',
            },
            skosAs: 'collection',
            member: stranded.map((node, at) => ({
                mid: `m${at + 1}`,
                term: resolveTerm(node) ?? node.id,
                parent: null,
            })),
            omcMigrated: true,
        }
        : null;

    if (unplaced) collections.push(unplaced);

    const root = {
        _id: OMC_ROOT,
        label: [{ value: 'OMC Controlled Values', language: DEFAULT_LANGUAGE, labelType: 'pref' }],
        definition: {
            en: 'Every controlled value OMC-JSON defines, one grouping per property that admits '
                + 'them. A heading, not a vocabulary of its own — the terms below belong to the '
                + 'vocabulary and most of them are shared with it.',
        },
        // Contributes structure only. Publishing it as a scheme would assert that OMC's controlled
        // values are a vocabulary separate from the one they are drawn from, which is the fiction
        // this merge exists to remove.
        skosAs: 'transparent',
        member: collections.map((collection, at) => ({
            mid: `m${at + 1}`,
            collection: collection._id,
            parent: null,
        })),
        omcMigrated: true,
    };

    return {
        terms: [...minted.values()],
        collections,
        root,
        tokenPatches,
        report,
    };
}
