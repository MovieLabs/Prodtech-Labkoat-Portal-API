/**
 * The edges as a document, written the way the model documents write them: a section per class, and
 * under it each relationship as the name it publishes, the name that answers it, and what sits at the
 * other end.
 *
 * ```
 * ### Portrayal
 *
 * | | Relationship | Points at |
 * |---|---|---|
 * | portrayalOf → | ← usedInPortrayal | **Character** — The Character being portrayed |
 * ```
 *
 * A class is listed where an edge starts at it, and every edge it carries is listed once under each
 * of its ends, so the section for a class is everything that class takes part in. Reading it against
 * the canvas is the point: the canvas shows a few classes at a time, this shows all of them.
 *
 * @module vocabulary/edges/generators/markdown
 */

import { DIRECTIONS, carries } from '../check.js';

/** A cell's text, with the pipes and newlines a table cannot hold taken out. */
const cell = ((text) => String(text ?? '').replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim());

/** What a direction is called in each format, either being absent where it publishes nothing. */
function namesOf(stored) {
    return {
        json: stored?.json?.include ? stored?.names?.predicate?.value ?? null : null,
        rdf: stored?.rdf?.include === false ? null : stored?.names?.rdfName?.value ?? null,
    };
}

/**
 * One relationship as a row: what it is called leaving this class, what answers it, and the class it
 * points at with what the vocabulary says that class is.
 *
 * @param {object} params
 * @param {object} params.edge
 * @param {'forward'|'reverse'} params.direction - The way round this row is being written
 * @param {object} params.index
 * @returns {string[]|null} Three cells, or null where the direction publishes nothing
 */
function rowFor({ edge, direction, index }) {
    const other = direction === 'forward' ? 'reverse' : 'forward';
    const to = direction === 'forward' ? 'range' : 'domain';
    const out = namesOf(edge[direction]);
    if (!out.json && !out.rdf) return null;

    const back = carries(edge, other) ? namesOf(edge[other]) : { json: null, rdf: null };
    const range = index.classes.get(edge[to]?.term);
    const names = ((one) => [one.json, one.rdf === one.json ? null : one.rdf].filter(Boolean).join(' / '));

    const points = range
        ? `**${range.label}**${range.definition ? ` — ${range.definition}` : ''}`
        : `\`${edge[to]?.term}\` — no longer in the entity structure`;

    return [
        `${names(out)} →`,
        back.json || back.rdf ? `← ${names(back)}` : '—',
        points,
    ].map(cell);
}

/**
 * The document.
 *
 * @param {object} ctx - `{ edges, index, settings }`
 * @returns {{body: string, problems: object}}
 */
export function toEdgeMarkdown({ edges, index, settings }) {
    const sections = new Map();
    const skipped = [];

    edges.forEach((edge) => {
        DIRECTIONS.filter(({ direction }) => carries(edge, direction)).forEach(({ direction }) => {
            const start = edge[direction === 'forward' ? 'domain' : 'range']?.term;
            const entry = index.classes.get(start);
            if (!entry) {
                skipped.push({ edgeId: edge._id, direction, reason: 'endNotInView' });
                return;
            }
            const row = rowFor({ edge, direction, index });
            if (!row) return;
            sections.set(start, [...(sections.get(start) ?? []), row]);
        });
    });

    const listed = [...sections.keys()]
        .map((id) => index.classes.get(id))
        .sort((a, b) => a.label.localeCompare(b.label));

    const lines = [
        '# OMC edges',
        '',
        `Every relationship the edge definitions state, by the class it starts at. Read from \`${settings.viewId}\`.`,
        '',
        `${edges.length} ${edges.length === 1 ? 'relationship' : 'relationships'} across ${listed.length} classes.`,
        '',
    ];

    listed.forEach((entry) => {
        lines.push(`## ${entry.label}`, '');
        if (entry.definition) lines.push(entry.definition, '');
        if (entry.jsonType && entry.jsonType !== entry.name) lines.push(`Publishes to OMC-JSON as \`${entry.jsonType}\`.`, '');
        lines.push('| Relationship | Answered by | Points at |', '|---|---|---|');
        sections.get(entry.id)
            .sort((a, b) => a[0].localeCompare(b[0]))
            .forEach((row) => lines.push(`| ${row.join(' | ')} |`));
        lines.push('');
    });

    return {
        body: lines.join('\n'),
        problems: { ...(skipped.length ? { skipped } : {}) },
    };
}
