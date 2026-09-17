/**
 * Every edge as a grid: one row per class an edge starts at, one column per class one points at.
 *
 * A matrix answers a question the row-per-edge CSV cannot — which classes relate to which, and where
 * nothing relates at all. The gaps are the point, so a class an edge could join is on both axes even
 * where it takes none.
 *
 * **The axes are the classes an edge may join**, which is what the entity structure tags as an entity
 * or an abstract. Every class the view holds would put a grouping, a record and every field on both
 * axes: 127 by 127 for 172 relationships, over 98% of it empty by construction rather than because
 * anything is missing. A grid nothing could ever fill says nothing by being empty.
 *
 * A cell holds the names the relationship publishes in the lens asked for, `forward ↔ reverse` where
 * the edge carries both and `forward` where it carries one. Several edges between the same two
 * classes are separated by `; `, in the order they were created, so an ordered pair is one cell
 * however many relationships it holds.
 *
 * @module vocabulary/edges/generators/matrix
 */

import { document } from '../../generators/csv.js';
import { DIRECTIONS, carries } from '../check.js';

/** What a direction is called, in the lens. */
function nameIn(stored, lens) {
    if (lens === 'rdf') return stored?.rdf?.include === false ? null : stored?.names?.rdfName?.value ?? null;
    return stored?.json?.include ? stored?.names?.predicate?.value ?? null : null;
}

/**
 * What one edge writes in the cell for the ordered pair it starts at.
 *
 * @param {object} edge
 * @param {'forward'|'reverse'} direction - The direction this cell is being written for
 * @param {string} lens
 * @returns {string|null}
 */
function cellFor(edge, direction, lens) {
    const other = direction === 'forward' ? 'reverse' : 'forward';
    const name = carries(edge, direction) ? nameIn(edge[direction], lens) : null;
    if (!name) return null;
    const back = carries(edge, other) ? nameIn(edge[other], lens) : null;
    return back ? `${name} ↔ ${back}` : name;
}

/**
 * The edge matrix.
 *
 * @param {object} ctx - `{ edges, index, settings }`
 * @returns {{body: string, problems: object}}
 */
export function toEdgeMatrix(ctx) {
    const { edges, index } = ctx;
    const lens = 'json';
    const classes = [...index.classes.values()]
        .filter((entry) => entry.joinable)
        .sort((a, b) => a.label.localeCompare(b.label));
    const cells = new Map();
    const skipped = [];

    const put = ((from, to, text) => {
        const key = `${from}|${to}`;
        cells.set(key, [...(cells.get(key) ?? []), text]);
    });

    edges.forEach((edge) => {
        DIRECTIONS.forEach(({ direction, from, to }) => {
            const text = cellFor(edge, direction, lens);
            if (!text) return;
            const start = edge[from]?.term;
            const end = edge[to]?.term;
            if (!index.classes.has(start) || !index.classes.has(end)) {
                skipped.push({ edgeId: edge._id, direction, reason: 'endNotInView' });
                return;
            }
            put(start, end, text);
        });
    });

    // The first column names the row's class; every other column is a class an edge may point at.
    const columns = [{ header: 'Domain \\ Range' }, ...classes.map((entry) => ({ header: entry.label }))];
    const rows = classes.map((row) => [
        row.label,
        ...classes.map((column) => (cells.get(`${row.id}|${column.id}`) ?? []).join('; ')),
    ]);

    return {
        body: document(columns, rows, ','),
        problems: { ...(skipped.length ? { skipped } : {}) },
    };
}
