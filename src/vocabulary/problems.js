/**
 * What went wrong resolving or rendering a view, in sentences a person can act on.
 *
 * The resolver records each problem by identifier — a container, a member row, a term — because that
 * is what the walk has in hand. An identifier tells the person reading it nothing: `vmc:c-00004D#f1`
 * does not say "Asset Function's arrangement v30", and a count says less still. This names the term,
 * the arrangement holding the row, where the view reaches it, and what it cost the output.
 *
 * Divergence is not described here. `GET /views/:id/problems` expands it into the placements that
 * disagree, which is a structure the Validate dialog draws rather than a sentence.
 *
 * @module vocabulary/problems
 */

import { readArrangementContainer } from './store/ids.js';
import { labelOfType, prefLabel } from './store/read.js';

/** How many names a problem about many terms spells out before counting the rest. */
const NAMES_SHOWN = 12;

/**
 * `A, B and C`, or `A, B … and 40 more`.
 *
 * @param {string[]} names
 * @returns {string}
 */
function listNames(names) {
    const shown = names.slice(0, NAMES_SHOWN);
    const rest = names.length - shown.length;
    if (rest > 0) return `${shown.join(', ')} and ${rest} more`;
    if (shown.length < 2) return shown.join('');
    return `${shown.slice(0, -1).join(', ')} and ${shown.at(-1)}`;
}

/** `1 term has` / `3 terms have`. */
const counted = ((n, one, many) => `${n} ${n === 1 ? one : many}`);

/**
 * Every problem that names something, as a sentence.
 *
 * @param {object} params
 * @param {object} params.resolution - What `resolveView` returned
 * @param {object} [params.problems] - The resolver's problems with a generator's merged in; defaults
 *   to the resolver's alone
 * @returns {Array<{kind: string, text: string}>} `kind` is the key in `problems` it describes
 */
export function describeProblems({ resolution, problems = resolution.problems }) {
    const { view, terms, language } = resolution;
    const labelType = view?.labelType ?? 'pref';
    const nameOf = ((id) => labelOfType(terms.get(id), labelType, language) || id);

    /** A container, named: the view, or one of a term's arrangements. */
    const containerName = ((containerId) => {
        if (containerId === view?._id) return `the view ${prefLabel(view, language)}`;
        const { termId, forkId } = readArrangementContainer(containerId);
        const term = terms.get(termId);
        const named = forkId
            ? (term?.fork ?? []).find((fork) => fork.id === forkId)?.name ?? forkId
            : term?.arrangementName;
        return named ? `${nameOf(termId)}'s arrangement "${named}"` : `${nameOf(termId)}'s arrangement`;
    });

    /**
     * Where the view reaches a row, as the names above it. One row can be reached by several paths
     * — an arrangement travels wherever its term is placed — so every one is given.
     */
    const reachedAt = ((containerId, mid) => {
        const paths = [...resolution.placements, ...resolution.suppressed]
            .filter((placement) => placement.collectionId === containerId && placement.mid === mid)
            .map((placement) => placement.path.map((entry) => nameOf(entry.id)).join(' › ') || 'the top of the view');
        return [...new Set(paths)];
    });

    const said = [];

    (problems.missingArrangements ?? []).forEach(({
        collection, mid, term, arrangement,
    }) => {
        const where = reachedAt(collection, mid);
        said.push({
            kind: 'missingArrangements',
            text: `${nameOf(term)} (${term})${where.length ? `, under ${where.join('; ')},` : ''} asks for `
                + `an arrangement "${arrangement}" that it no longer has, so nothing is published beneath it. `
                + `The placement is row ${mid} of ${containerName(collection)}: remove it and place `
                + `${nameOf(term)} again.`,
        });
    });

    (problems.missingTerms ?? []).forEach(({ collection, mid, term }) => {
        said.push({
            kind: 'missingTerms',
            text: `Row ${mid} of ${containerName(collection)} places ${term}, which is not in the store. `
                + 'It is left out and anything beneath it moves up a level. Remove the placement.',
        });
    });

    (problems.cycles ?? []).forEach(({ collection, via }) => {
        const loop = [...(via ?? []), collection]
            .map((containerId) => nameOf(readArrangementContainer(containerId).termId));
        said.push({
            kind: 'cycles',
            text: `${containerName(collection)} contains itself, by way of ${loop.join(' › ')}. `
                + 'The walk stops where the loop closes, so nothing beyond that point is published there.',
        });
    });

    const untyped = problems.untyped ?? [];
    if (untyped.length) {
        said.push({
            kind: 'untyped',
            text: `${counted(untyped.length, 'term has', 'terms have')} no "${labelType}" label, so `
                + `${untyped.length === 1 ? 'its name was' : 'their names were'} worked out from the `
                + `preferred label: ${listNames(untyped.map(nameOf))}.`,
        });
    }

    // One sentence per type rather than per value: a removed note type is one decision to reverse,
    // however many terms were carrying it.
    const unknown = new Map();
    (problems.unknownTypes ?? []).forEach(({ term, target, type }) => {
        const key = JSON.stringify([target, type]);
        if (!unknown.has(key)) unknown.set(key, { target, type, terms: new Set() });
        unknown.get(key).terms.add(term);
    });
    unknown.forEach(({ target, type, terms: using }) => {
        said.push({
            kind: 'unknownTypes',
            text: `The ${target} type "${type}" is not in the controlled sets, so the ${target}s of that `
                + `type were left out, on ${listNames([...using].map(nameOf))}. Put the type back, or `
                + 'change those values to one that exists.',
        });
    });

    return said;
}
