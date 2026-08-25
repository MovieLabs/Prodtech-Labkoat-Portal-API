/**
 * Check a built model against the graph it came from.
 *
 * A migration that loses something must be caught by a number here, not by a user months later.
 * Every check either compares a count back to the source, or asserts an invariant the new model
 * relies on and the old one had no way to state.
 *
 * Checks are pure and take no database: the CLI runs them before writing, so a failing migration
 * writes nothing at all.
 *
 * @module vocabulary/migrate/verify
 */

/**
 * @typedef {object} Check
 * @property {string} name
 * @property {boolean} pass
 * @property {string} detail - What was found, stated so it can be compared to the source by hand
 */

/**
 * Run every check.
 *
 * @param {object} params
 * @param {import('./readGraph.js').SkosGraph} params.graph - What was read
 * @param {Array<object>} params.terms
 * @param {Array<object>} params.collections - Scheme collections
 * @param {Array<object>} params.attach - The member rows the view will hold
 * @returns {{pass: boolean, checks: Check[]}}
 */
export function verifyMigration({ graph, terms, collections, attach }) {
    const checks = [];
    const add = ((name, pass, detail) => checks.push({ name, pass, detail }));

    const sourceOfType = ((type) => [...graph.nodes.values()].filter((node) => node.type === type).length);

    // ---- nothing lost ----

    const sourceConcepts = sourceOfType('skos:Concept');
    add(
        'every Concept became a term',
        terms.length === sourceConcepts,
        `${terms.length} terms from ${sourceConcepts} Concepts`,
    );

    // `coll:unplaced` is excluded: it derives from the terms no scheme claimed, not from a scheme,
    // so counting it here would compare 13 collections against 12 schemes and read as a fault.
    const sourceSchemes = sourceOfType('skos:ConceptScheme');
    const schemeCollections = collections.filter((collection) => collection._id !== 'coll:unplaced');
    add(
        'every ConceptScheme became a collection',
        schemeCollections.length === sourceSchemes,
        `${schemeCollections.length} collections from ${sourceSchemes} ConceptSchemes`,
    );

    // Every inScheme edge in the source must be a member somewhere. This is the check that would
    // catch the per-scheme resolution dropping a placement.
    //
    // Counted as **distinct** source edges, because the graph carries duplicate relationships (139
    // of them, all `topConceptOf`) and a raw instance count would compare a deduplicated model
    // against a source that double-counts.
    //
    // The unplaced collection is excluded from both sides. Its members come from terms that have no
    // `inScheme` edge at all — that is what makes them unplaced — so counting them against a total
    // of inScheme edges compares two different things. They get their own check below.
    const sourceMemberships = new Set(
        graph.edges.filter((edge) => edge.relation === 'inScheme')
            .map((edge) => `${edge.source}|${edge.target}`),
    ).size;
    const fromSchemes = collections.filter((collection) => collection._id !== 'coll:unplaced');
    const builtMembers = fromSchemes.reduce((total, collection) => total + collection.member.length, 0);
    add(
        'every inScheme edge became a member',
        builtMembers === sourceMemberships,
        `${builtMembers} members from ${sourceMemberships} distinct inScheme edges`,
    );

    // Terms in no scheme are gathered rather than dropped. The old serializer emitted them because
    // it walked every Concept rather than any membership; a view publishes a collection, so without
    // this they would silently stop appearing in the SKOS output.
    const unplacedCollection = collections.find((collection) => collection._id === 'coll:unplaced');
    const withScheme = new Set(graph.edges.filter((edge) => edge.relation === 'inScheme').map((edge) => edge.source));
    const sourceUnplaced = [...graph.nodes.entries()]
        .filter(([id, node]) => node.type === 'skos:Concept' && !withScheme.has(id)).length;
    add(
        'terms in no scheme are gathered, not dropped',
        (unplacedCollection?.member.length ?? 0) === sourceUnplaced,
        `${unplacedCollection?.member.length ?? 0} gathered from ${sourceUnplaced} scheme-less Concepts`,
    );

    // ---- the new model's invariants ----

    // Exactly one preferred label per language. The cost of collapsing prefLabel into the label
    // array, and the thing that breaks SKOS output if it is violated.
    const badPref = terms.filter((term) => {
        const byLanguage = new Map();
        (term.label ?? [])
            .filter((label) => label.labelType === 'pref')
            .forEach((label) => byLanguage.set(label.language, (byLanguage.get(label.language) ?? 0) + 1));
        return [...byLanguage.values()].some((count) => count !== 1) || byLanguage.size === 0;
    });
    add(
        'exactly one pref label per language per term',
        badPref.length === 0,
        badPref.length ? `${badPref.length} offending: ${badPref.slice(0, 5).map((t) => t._id).join(', ')}` : 'all terms',
    );

    const termIds = new Set(terms.map((term) => term._id));
    const allCollections = collections;

    // A member naming a term that does not exist would render as a hole in every view.
    const orphanTerms = allCollections.flatMap((collection) => (collection.member ?? [])
        .filter((member) => member.term && !termIds.has(member.term))
        .map((member) => `${collection._id}/${member.mid}`));
    add(
        'no member names a missing term',
        orphanTerms.length === 0,
        orphanTerms.length ? `${orphanTerms.length}: ${orphanTerms.slice(0, 5).join(', ')}` : 'none',
    );

    const collectionIds = new Set(allCollections.map((collection) => collection._id));
    const orphanCollections = allCollections.flatMap((collection) => (collection.member ?? [])
        .filter((member) => member.collection && !collectionIds.has(member.collection))
        .map((member) => `${collection._id}/${member.mid}`));
    add(
        'no member names a missing collection',
        orphanCollections.length === 0,
        orphanCollections.length ? `${orphanCollections.length}: ${orphanCollections.slice(0, 5).join(', ')}` : 'none',
    );

    // A parent naming a mid that is not in the same collection. Would break the walk that derives
    // dotted labels and the broader/narrower projection.
    const orphanParents = allCollections.flatMap((collection) => {
        const mids = new Set((collection.member ?? []).map((member) => member.mid));
        return (collection.member ?? [])
            .filter((member) => member.parent && !mids.has(member.parent))
            .map((member) => `${collection._id}/${member.mid}`);
    });
    add(
        'every parent names a member of the same collection',
        orphanParents.length === 0,
        orphanParents.length ? `${orphanParents.length}: ${orphanParents.slice(0, 5).join(', ')}` : 'none',
    );

    // A parent chain that loops. The view resolver walks these, so a cycle is a hang.
    const cycles = allCollections.filter((collection) => {
        const parentOf = new Map((collection.member ?? []).map((member) => [member.mid, member.parent]));
        return [...parentOf.keys()].some((start) => {
            const seen = new Set();
            let at = start;
            while (at) {
                if (seen.has(at)) return true;
                seen.add(at);
                at = parentOf.get(at) ?? null;
            }
            return false;
        });
    });
    add(
        'no parent cycle in any collection',
        cycles.length === 0,
        cycles.length ? cycles.map((collection) => collection._id).join(', ') : 'none',
    );

    // ---- the reuse the model exists for ----

    const placements = new Map();
    collections.forEach((collection) => {
        collection.member.forEach((member) => {
            placements.set(member.term, (placements.get(member.term) ?? 0) + 1);
        });
    });
    const multi = [...placements.entries()].filter(([, count]) => count > 1);
    // Not an equality assertion: the source is what it is, and the number is here to be read and
    // compared. In the checked-in snapshot it is 20.
    add(
        'terms placed in more than one collection',
        true,
        `${multi.length} terms (expected 20 against the current data)`,
    );

    add(
        'the view attaches every collection',
        attach.length === collections.length,
        `${attach.length} attached for ${collections.length} collections`,
    );

    return { pass: checks.every((check) => check.pass), checks };
}

/**
 * Render checks for a terminal.
 *
 * @param {{pass: boolean, checks: Check[]}} result
 * @returns {string}
 */
export function formatChecks(result) {
    const lines = result.checks.map((check) => `  ${check.pass ? 'PASS' : 'FAIL'}  ${check.name}\n        ${check.detail}`);
    return `${lines.join('\n')}\n\n  ${result.pass ? 'All checks passed.' : 'FAILED — nothing was written.'}`;
}
