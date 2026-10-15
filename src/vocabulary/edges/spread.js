/**
 * Spread edges: one edge standing for every entity class below its domain related to every one
 * below its range, less the classes it excludes.
 *
 * `informs` can join any two entities. Drawn one pair at a time that is hundreds of edges to make and
 * keep; drawn once between two abstract classes and spread, it is one, and a class added to the
 * structure later is covered without anybody returning to it.
 *
 * A spread edge is stored as `{ spread: { except: [termId…] } }` on an ordinary edge. Its own ends
 * are where it is drawn; what it publishes is the classes below them:
 *
 * - **RDF** declares the edge's property with every one of those classes in its domain or range.
 * - **OMC-JSON** gets a row for each pairing whose two classes are each an entityType in their own
 *   right. A class that only projects to an ancestor's entityType is left out of it, since two of
 *   those would write one path with two different inverses.
 *
 * @module vocabulary/edges/spread
 */

/**
 * Whether an edge is a spread edge.
 *
 * @param {object} edge
 * @returns {boolean}
 */
export const isSpread = ((edge) => !!edge?.spread);

/**
 * The classes a spread end stands for: every class at or below `termId` that a spread reaches
 * (`spreadTarget`, the entity classes), less `except`. At the root class that is every one of them,
 * since the RDF build makes each entity class its subclass.
 *
 * @param {Map<string, object>} classes - From `classIndex`
 * @param {string} termId
 * @param {string[]} [except]
 * @returns {Array<object>} In the index's order
 */
export function spreadClasses(classes, termId, except = []) {
    const left = new Set(except);
    const fromRoot = !!classes.get(termId)?.root;
    return [...classes.values()].filter((entry) => entry.spreadTarget && !left.has(entry.id)
        && (fromRoot || entry.id === termId || entry.ancestors.includes(termId)));
}

/**
 * Both ends of a spread edge, as the classes each stands for.
 *
 * @param {object} edge
 * @param {Map<string, object>} classes
 * @returns {{domain: Array<object>, range: Array<object>}}
 */
export const spreadEnds = ((edge, classes) => ({
    domain: spreadClasses(classes, edge.domain?.term, edge.spread?.except),
    range: spreadClasses(classes, edge.range?.term, edge.spread?.except),
}));

/**
 * Whether a class is an OMC-JSON entityType in its own right, rather than projecting to an
 * ancestor's.
 *
 * @param {object} entry
 * @returns {boolean}
 */
export const ownJsonType = ((entry) => !!entry?.jsonType && entry.jsonTerm === entry.id);

/**
 * The class pairings one direction of a spread edge publishes to OMC-JSON.
 *
 * @param {object} edge
 * @param {'domain'|'range'} from - The end the direction starts at
 * @param {Map<string, object>} classes
 * @returns {Array<[object, object]>} `[from, to]` class entries
 */
export function spreadJsonPairings(edge, from, classes) {
    const ends = spreadEnds(edge, classes);
    const starts = (from === 'domain' ? ends.domain : ends.range).filter(ownJsonType);
    const finishes = (from === 'domain' ? ends.range : ends.domain).filter(ownJsonType);
    return starts.flatMap((start) => finishes.map((finish) => [start, finish]));
}

/**
 * The excluded classes the spread no longer reaches: deleted, moved out from under it, or no longer
 * an entity class. Each is an exclusion that does nothing.
 *
 * @param {object} edge
 * @param {Map<string, object>} classes
 * @returns {string[]} Term ids
 */
export function strayExceptions(edge, classes) {
    const reached = new Set([
        ...spreadClasses(classes, edge.domain?.term),
        ...spreadClasses(classes, edge.range?.term),
    ].map((entry) => entry.id));
    return (edge.spread?.except ?? []).filter((id) => !reached.has(id));
}
