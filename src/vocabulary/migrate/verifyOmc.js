/**
 * Check the merged OMC model against the graph it came from.
 *
 * The failure this exists to catch is specific and quiet: a controlled value that does not survive
 * the merge does not produce an error anywhere. It produces a schema table with one fewer entry,
 * six months later, in a repository nobody is looking at. So every check below either compares a
 * count back to Neo4j or asserts something the dotted name depends on.
 *
 * Pure, and takes no database — the CLI runs them before writing, so a failing merge writes nothing.
 *
 * @module vocabulary/migrate/verifyOmc
 */

import { isKind } from './readOmcGraph.js';

/**
 * Run every check.
 *
 * @param {object} params
 * @param {object} params.graph - From `readOmcGraph`
 * @param {object} params.model - From `buildOmcModel`
 * @param {Map<string, object>} params.existingTerms
 * @returns {{pass: boolean, checks: Array<{name: string, pass: boolean, detail: string}>}}
 */
export function verifyOmcMerge({ graph, model, existingTerms }) {
    const checks = [];
    const add = ((name, pass, detail) => checks.push({ name, pass, detail }));

    const { terms, collections, root, report, tokenPatches } = model;

    const sourceValues = [...graph.nodes.values()].filter((node) => isKind(node, 'ControlledValue'));

    // ---- nothing lost ----

    // Every value node is either reached by the walk or gathered as unattached. A third outcome —
    // neither — is a value that left the model without a word, which is the failure this whole
    // module exists for.
    const accounted = report.visitedValues + report.unreachableValues.length;
    add(
        'every controlled value is accounted for',
        accounted === sourceValues.length,
        `${sourceValues.length} in the graph = ${report.visitedValues} placed `
        + `+ ${report.unreachableValues.length} unattached`,
    );

    // Not a fault in the merge — a fault in the source that the merge must not hide. `wild` is one
    // of these, and the schema wants `capture.audio.wild`, so the value is real and its edge to a
    // parent is missing. Gathered flat, and the drift report is where that shows up as actionable.
    const unplaced = collections.find((collection) => collection._id === 'coll:omc-unplaced');
    add(
        'unattached values are gathered rather than dropped',
        report.unreachableValues.length === (unplaced?.member.length ?? 0),
        report.unreachableValues.length
            ? `${report.unreachableValues.length} gathered into coll:omc-unplaced: ${
                report.unreachableValues.map((v) => `${v.label} (${v.id})`).join(', ')}`
            : 'none to gather',
    );

    add(
        'no member points at a term that is not there',
        report.pointingAtMissingTerm.length === 0,
        report.pointingAtMissingTerm.length
            ? `${report.pointingAtMissingTerm.length} dangling: ${
                report.pointingAtMissingTerm.slice(0, 5).map((p) => `${p.label} -> ${p.concept}`).join(', ')}`
            : 'none',
    );

    // ---- the arrangement holds together ----

    const allMembers = collections.flatMap((collection) => collection.member);

    // Every member names a term that will exist after the write — one this run mints, or one the
    // vocabulary already holds. This is the check that a member pointing at nothing would fail, and
    // a member pointing at nothing is a hole in a schema table.
    const willExist = new Set([...terms.map((term) => term._id), ...existingTerms.keys()]);
    const unknown = allMembers.filter((member) => !willExist.has(member.term));
    add('every member names a term that will exist', unknown.length === 0,
        unknown.length
            ? `${unknown.length} point at nothing: ${unknown.slice(0, 5).map((m) => m.term).join(', ')}`
            : `${allMembers.length} members over ${new Set(allMembers.map((m) => m.term)).size} distinct terms`);

    const orphans = collections.flatMap((collection) => {
        const mids = new Set(collection.member.map((member) => member.mid));
        return collection.member
            .filter((member) => member.parent && !mids.has(member.parent))
            .map((member) => `${collection._id}/${member.mid}`);
    });
    add('no member names a parent outside its collection', orphans.length === 0,
        orphans.length ? orphans.slice(0, 5).join(', ') : `${allMembers.length} members, none orphaned`);

    const duplicateMids = collections.filter((collection) => {
        const mids = collection.member.map((member) => member.mid);
        return new Set(mids).size !== mids.length;
    });
    add('member ids are unique within each collection', duplicateMids.length === 0,
        duplicateMids.length ? duplicateMids.map((c) => c._id).join(', ') : `${collections.length} collections`);

    const cycles = collections.filter((collection) => {
        const parentOf = new Map(collection.member.map((member) => [member.mid, member.parent]));
        return collection.member.some((member) => {
            const seen = new Set();
            let at = member.mid;
            while (at) {
                if (seen.has(at)) return true;
                seen.add(at);
                at = parentOf.get(at) ?? null;
            }
            return false;
        });
    });
    add('no parent chain loops', cycles.length === 0,
        cycles.length ? cycles.map((c) => c._id).join(', ') : 'none');

    add(
        'the root gathers every property collection',
        root.member.length === collections.length,
        `${root.member.length} members over ${collections.length} collections`,
    );

    // ---- the names the schema depends on ----

    // Every term in this model must carry an `omcToken`, because the view renders names from it.
    // A term without one falls back to its preferred name — `Audio` where the schema wants `audio` —
    // and a wrong controlled value looks exactly like a right one.
    const mintedWithoutToken = terms.filter(
        (term) => !(term.label ?? []).some((label) => label.labelType === 'omcToken'),
    );
    add('every minted term carries an OMC token', mintedWithoutToken.length === 0,
        mintedWithoutToken.length
            ? mintedWithoutToken.slice(0, 5).map((t) => t._id).join(', ')
            : `${terms.length} minted terms`);

    const placedTermIds = new Set(allMembers.map((member) => member.term));
    const sharedTermIds = [...placedTermIds].filter((id) => existingTerms.has(id));
    const withoutPatch = sharedTermIds.filter((id) => !tokenPatches.has(id));
    add('every shared term will receive an OMC token', withoutPatch.length === 0,
        withoutPatch.length
            ? `${withoutPatch.length} missing: ${withoutPatch.slice(0, 5).join(', ')}`
            : `${sharedTermIds.length} shared terms, all patched`);

    // Exactly one preferred label per language — the invariant the whole label array rests on, and
    // one a minted term could break by carrying two `pref` entries.
    const badPref = terms.filter((term) => {
        const byLanguage = new Map();
        (term.label ?? []).filter((label) => label.labelType === 'pref').forEach((label) => {
            const language = label.language ?? 'en';
            byLanguage.set(language, (byLanguage.get(language) ?? 0) + 1);
        });
        return !byLanguage.size || [...byLanguage.values()].some((count) => count > 1);
    });
    add('exactly one preferred label per language', badPref.length === 0,
        badPref.length ? badPref.slice(0, 5).map((t) => t._id).join(', ') : `${terms.length} terms`);

    // ---- the merge did what it was for ----

    // Not an assertion about a number, an assertion about the point: if nothing joined, the two
    // graphs are still two and this stage achieved nothing.
    add(
        'the two graphs actually joined',
        report.joinedToExistingTerm > 0,
        `${report.joinedToExistingTerm} placements point at terms the vocabulary already held`,
    );

    // A minted id must not collide with a term that exists, or the write would overwrite meaning
    // with a controlled value's label.
    const collisions = terms.filter((term) => existingTerms.has(term._id));
    add('no minted term collides with an existing one', collisions.length === 0,
        collisions.length ? collisions.slice(0, 5).map((t) => t._id).join(', ') : `${terms.length} minted`);

    return { pass: checks.every((check) => check.pass), checks };
}

/**
 * Render checks for the console.
 *
 * @param {object} result
 * @returns {string}
 */
export function formatOmcChecks(result) {
    const lines = result.checks.map(
        (check) => `  ${check.pass ? 'PASS' : 'FAIL'}  ${check.name}\n        ${check.detail}`,
    );
    return `${lines.join('\n')}\n\n  ${result.pass ? 'All checks passed.' : 'FAILED — nothing was written.'}`;
}
