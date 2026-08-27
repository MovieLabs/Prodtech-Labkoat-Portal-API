/**
 * What a view publishes in a given format, and what it publishes when it has not said.
 *
 * A view carries an `export` map. Every generator reads its profile from here rather than from the
 * view directly, so there is one place that knows what an unconfigured view means — and a view that
 * has never been configured keeps producing exactly what it produced before this existed.
 *
 * ## Keyed by kind, not by format
 *
 * Several formats are the same decisions written down differently, and each such group takes one
 * profile:
 *
 * - **`skos`** — `skos-ttl` and `skos-jsonld` are one projection with two encodings.
 *   `generators/index.js` builds a single triple set and writes it down twice, so separate profiles
 *   would offer a difference the generator cannot express.
 * - **`table`** — `csv` and `xlsx` are one table in two containers. A column named `Definition` in
 *   the sheet and `definition` in the file is not a choice anybody wants to have made; it is two
 *   places to keep one decision, which is how they drift.
 *
 * `markdown` keeps its own profile. It shares the machinery but not the decision: a table nobody
 * parses has room for three columns where a spreadsheet has room for fourteen, so one column list
 * across both would be wrong for one of them.
 *
 * @module vocabulary/exportProfiles
 */

/**
 * The profile a format reads.
 *
 * @param {string} format
 * @returns {string}
 */
export function profileKindOf(format) {
    const name = String(format);
    if (name.startsWith('skos-')) return 'skos';
    if (name === 'csv' || name === 'xlsx') return 'table';
    return name;
}

/**
 * How a tabular format writes more than one value into one cell.
 *
 * A pipe rather than a comma: it matches what the importer already splits `altLabel` on, and a comma
 * both needs the cell quoted and is far likelier to appear inside a label.
 */
export const DEFAULT_MULTI = ' | ';

/**
 * The columns a CSV has always had, in the order it has always had them — and now the workbook's
 * too, since the two are one table.
 *
 * **This list is load-bearing.** It is what a view with no profile publishes, so it has to reproduce
 * the hardcoded columns it replaced exactly — same sources, same order, same headers. The golden
 * files exist to prove it still does.
 *
 * `id` is first because it is what makes a re-import an update rather than a duplicate: the importer
 * reads a blank id as a new term and a present one as an edit.
 *
 * `displayLabel` and `paths` genuinely held the same value, and still do. That was invisible while
 * the list was in code and is worth leaving visible here, because now somebody can remove one.
 */
const TABLE_COLUMNS = [
    { source: 'id', header: 'id' },
    { source: 'label:pref', header: 'prefLabel' },
    { source: 'display', header: 'displayLabel' },
    { source: 'definition', header: 'definition' },
    { source: 'status', header: 'status' },
    { source: 'labels', header: 'altLabel' },
    { source: 'labelTypes', header: 'labelTypes' },
    { source: 'notes', header: 'notes' },
    { source: 'noteTypes', header: 'noteTypes' },
    { source: 'examples', header: 'examples' },
    { source: 'container', header: 'collections' },
    { source: 'scheme', header: 'schemes' },
    { source: 'display', header: 'paths' },
    { source: 'tags', header: 'tags' },
];

/**
 * What each kind publishes when the view has not said.
 *
 * The SKOS default is an empty override map, which resolves to the projections the controlled sets
 * declare — which is what SKOS export did before a view could override anything.
 *
 * @type {Object<string, object>}
 */
export const DEFAULT_PROFILES = {
    skos: { labels: {}, notes: {}, examples: {} },
    table: {
        rows: 'term',
        // `none` rather than `per-scheme`, which is what a CSV has always produced. A workbook would
        // arguably rather open on a sheet per scheme, but one profile has one answer and this is the
        // one that leaves an unconfigured view publishing what it published before.
        split: 'none',
        // Read by CSV and ignored by the workbook, which has no separator to choose.
        delimiter: ',',
        multi: DEFAULT_MULTI,
        columns: TABLE_COLUMNS,
    },
    markdown: {
        rows: 'term',
        split: 'none',
        multi: DEFAULT_MULTI,
        // A markdown table is read rather than parsed, and fourteen columns is unreadable. The
        // default is what somebody scanning a vocabulary actually wants to see.
        columns: [
            { source: 'display', header: 'Term' },
            { source: 'definition', header: 'Definition' },
            { source: 'status', header: 'Status' },
        ],
    },
    json: { include: ['labels', 'notes', 'examples', 'tags', 'structure'] },
};

/** The kinds a profile may be written for. */
export const PROFILE_KINDS = Object.keys(DEFAULT_PROFILES);

/**
 * The profile a view publishes a format under.
 *
 * Scalars fall back to the default one at a time, so a profile saying only `split` keeps the default
 * columns. **`columns` replaces rather than merges**: an author who has listed columns means that
 * list, and a merge would reinstate ones they had removed.
 *
 * @param {object} view - The view document, as stored
 * @param {string} format
 * @returns {object}
 */
export function profileFor(view, format) {
    const kind = profileKindOf(format);
    const fallback = DEFAULT_PROFILES[kind];
    if (!fallback) return {};

    const stored = view?.export?.[kind];
    if (!stored) return fallback;

    return {
        ...fallback,
        ...stored,
        columns: stored.columns?.length ? stored.columns : fallback.columns,
    };
}

/**
 * The SKOS projections a view publishes under, its own overrides applied.
 *
 * The index the controlled sets build distinguishes three states, and all three have to survive the
 * overlay because the generator treats them differently:
 *
 * - **a predicate** — the type projects
 * - **`null`** — the type is dropped *by declaration*, because somebody chose that
 * - **absent from the map** — the type is unknown, and is reported as a problem rather than dropped
 *   in silence. It means a set value was removed while terms still carry it
 *
 * A view override can therefore say "publish this as something else" or "do not publish this here",
 * but it cannot make a type unknown — that state belongs to the controlled set alone.
 *
 * @param {Map<string, Map<string, (string|null)>>} projections - From `skosProjectionIndex`
 * @param {object} profile - The `skos` profile
 * @returns {Map<string, Map<string, (string|null)>>}
 */
export function projectionsWithOverrides(projections, profile) {
    const overrides = {
        label: profile?.labels ?? {},
        note: profile?.notes ?? {},
        example: profile?.examples ?? {},
    };

    const result = new Map();
    projections.forEach((values, appliesTo) => {
        const next = new Map(values);
        Object.entries(overrides[appliesTo] ?? {}).forEach(([type, predicate]) => {
            // Only over a type the set already knows. Overriding one it does not would invent the
            // fourth state — a type that publishes in this view and is unknown everywhere else.
            if (next.has(type)) next.set(type, predicate ?? null);
        });
        result.set(appliesTo, next);
    });
    return result;
}
