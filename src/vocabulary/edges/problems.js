/**
 * Edge problems as sentences.
 *
 * The check reports codes and the facts behind them; this says what each means to somebody deciding
 * what to do about it. Kept apart so the check stays a list of facts a test can compare.
 *
 * @module vocabulary/edges/problems
 */

const END_WORD = { domain: 'start', range: 'end' };

/**
 * One problem as a sentence.
 *
 * @param {object} problem - From `checkEdges`
 * @param {function(string): string} labelOf - A class or term label by id
 * @returns {string}
 */
export function describeEdgeProblem(problem, labelOf) {
    const term = problem.termId ? `"${labelOf(problem.termId)}"` : 'A class';
    const end = END_WORD[problem.end] ?? 'end';
    switch (problem.code) {
        case 'missingTerm':
            return `The class at the ${end} of this edge (${problem.termId}) no longer exists in the vocabulary.`;
        case 'notInView':
            return `${term}, at the ${end} of this edge, is no longer placed in the entity structure.`;
        case 'untagged':
            return `${term} is no longer tagged as an entity or an abstract class, so an edge cannot join it.`;
        case 'deprecatedTerm':
            return `${term} is deprecated.`;
        case 'noProjection':
            return `This edge is published to OMC-JSON, but ${term} has no OMC-JSON entity above it.`;
        case 'projectionChanged':
            return `${term} used to publish to OMC-JSON as ${problem.was ?? 'nothing'} and now publishes as ${problem.now ?? 'nothing'}.`;
        case 'classRenamed':
            return `"${problem.was}" has been renamed "${problem.now}".`;
        case 'namesDrifted':
            return `The ${problem.direction} ${problem.field} is ${JSON.stringify(problem.stored)}, but would now be generated as ${JSON.stringify(problem.generated)}.`;
        case 'overriddenName':
            return `The ${problem.direction} ${problem.field} was set by hand to ${JSON.stringify(problem.stored)}; it would be generated as ${JSON.stringify(problem.generated)}.`;
        case 'pairMissing':
            return 'The predicate pair this edge uses has been deleted.';
        case 'pairChanged':
            return 'The predicate pair this edge uses has changed since its names were generated.';
        case 'legacyInverse':
            return `The ${problem.direction} direction still carries the inverse edges.js gave it (${JSON.stringify(problem.inverse)}), which the pair does not explain.`;
        case 'jsonCollision':
            return `Another edge writes the same OMC-JSON path (${problem.key.replace('|', ' ')}) with a different inverse.`;
        case 'rdfConflict':
            return `The RDF property ${problem.rdfName} is also used by an edge meaning something else.`;
        case 'structuralDuplicate':
            return `The entity structure already relates these classes as ${problem.structural}.`;
        case 'redundantInherited':
            return 'The same predicate already joins superclasses of both ends, so this edge is inherited.';
        default:
            return problem.code;
    }
}
