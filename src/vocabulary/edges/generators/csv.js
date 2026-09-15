/**
 * The edge definitions as a flat CSV: one row per direction an edge carries, so a reviewer can
 * sort and filter every published name in a spreadsheet.
 *
 * @module vocabulary/edges/generators/csv
 */

import { document } from '../../generators/csv.js';
import { DIRECTIONS, carries } from '../check.js';

const COLUMNS = [
    'Edge', 'Status', 'Direction', 'Domain', 'Range', 'OMC-JSON domain', 'OMC-JSON range', 'Placement',
    'Predicate', 'Path', 'RDF name', 'Inverse RDF name', 'Publishes to OMC-JSON', 'Publishes to RDF', 'Set by hand',
].map((header) => ({ header }));

/**
 * The CSV document.
 *
 * @param {object} ctx - `{ edges, index }`
 * @returns {{body: string, problems: object}}
 */
export function toEdgeCsv({ edges, index }) {
    const rows = edges.flatMap((edge) => DIRECTIONS.filter(({ direction }) => carries(edge, direction))
        .map(({ direction, from, to }) => {
            const stored = edge[direction] ?? {};
            const names = stored.names ?? {};
            const domain = index.classes.get(edge[from]?.term);
            const range = index.classes.get(edge[to]?.term);
            const other = direction === 'forward' ? 'reverse' : 'forward';
            const overridden = Object.entries(names).filter(([, name]) => name?.override != null).map(([field]) => field);
            return [
                edge._id,
                edge.status,
                direction,
                domain?.label ?? edge[from]?.term,
                range?.label ?? edge[to]?.term,
                domain?.jsonType ?? '',
                range?.jsonType ?? '',
                names.placement?.value ?? '',
                names.predicate?.value ?? '',
                names.path?.value ?? '',
                names.rdfName?.value ?? '',
                carries(edge, other) ? edge[other]?.names?.rdfName?.value ?? '' : '',
                stored.json?.include ? 'yes' : 'no',
                stored.rdf?.include === false ? 'no' : 'yes',
                overridden.join(' '),
            ];
        }));
    return { body: document(COLUMNS, rows, ','), problems: {} };
}
