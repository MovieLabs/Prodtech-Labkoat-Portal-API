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
 * A comma, because that is what a reader expects between three synonyms and every cell in the CSV
 * is quoted anyway — so a comma inside one cannot end it early.
 *
 * It was a pipe, chosen to match what the importer splits `altLabel` on. That column no longer
 * exists: every label type now has its own, so there is nothing left for the pipe to line up with.
 *
 * The cost is real and is why this is a setting: a comma **inside** a value is indistinguishable
 * from the separator, so a vocabulary whose labels contain commas should choose something else.
 */
export const DEFAULT_MULTI = ', ';

/** A tag source names its set without repeating the `facet:` its identifier already carries. */
const tagSlug = ((facetId) => String(facetId).replace(/^facet:/, ''));

/**
 * The columns a table publishes when the view has not chosen any.
 *
 * **Derived from the controlled sets, not written down here.** Every label, note and example type
 * the vocabulary declares gets its own column, named after itself. A static list could only name the
 * types that existed when it was written, and would go on naming one after it was removed.
 *
 * This replaced a fixed fourteen carried over from the hardcoded exporter, which lumped every
 * non-preferred label into one `altLabel` cell with their kinds in a parallel column. A column per
 * type says the same thing and says which is which, so the spreadsheet round trip gains rather than
 * loses by it.
 *
 * `id` is first because it is what makes a re-import an update rather than a duplicate: the importer
 * reads a blank id as a new term and a present one as an edit.
 *
 * @param {Array<object>} facetDocs
 * @returns {Array<{source: string, header: string}>}
 */
function defaultTableColumns(facetDocs = []) {
    // The heading a value carries in its set, which is what the sets editor shows beside it. A
    // column is called what the vocabulary calls the thing it holds, unless a view says otherwise.
    const typed = ((appliesTo, prefix, skip = []) => facetDocs
        .filter((facet) => facet.appliesTo === appliesTo)
        .flatMap((facet) => (facet.values ?? []).map((value) => ({
            type: value[facet.key],
            heading: value.label?.en ?? value[facet.key],
        })))
        .filter((entry) => entry.type && !skip.includes(entry.type))
        .map((entry) => ({ source: `${prefix}:${entry.type}`, header: entry.heading })));

    return [
        { source: 'id', header: 'id' },
        // The preferred label always, and by name rather than as one of the list below — it is the
        // one every term carries and the one a reader looks for first.
        { source: 'label:pref', header: 'prefLabel' },
        { source: 'definition', header: 'definition' },
        { source: 'status', header: 'status' },
        ...typed('label', 'label', ['pref']),
        ...typed('note', 'note'),
        ...typed('example', 'example'),
        { source: 'collections', header: 'collections' },
        { source: 'scheme', header: 'schemes' },
        ...facetDocs
            .filter((facet) => facet.appliesTo === 'tag')
            .map((facet) => ({
                source: `tag:${tagSlug(facet._id)}`,
                header: facet.label?.en ?? tagSlug(facet._id),
            })),
    ];
}

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
        // Filled from the controlled sets by `profileFor`, which is the only thing that has them.
        columns: null,
    },
    markdown: {
        rows: 'term',
        split: 'none',
        multi: DEFAULT_MULTI,
        // A markdown table is read rather than parsed, and fourteen columns is unreadable. The
        // default is what somebody scanning a vocabulary actually wants to see.
        columns: [
            { source: 'label:pref', header: 'Term' },
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
 * @param {Array<object>} [facetDocs] - The controlled sets, which a table's default columns come from
 * @returns {object}
 */
export function profileFor(view, format, facetDocs = []) {
    const kind = profileKindOf(format);
    const base = DEFAULT_PROFILES[kind];
    if (!base) return {};

    // A table's default column list is the vocabulary's own types, so it cannot be a constant.
    const fallback = base.columns === null
        ? { ...base, columns: defaultTableColumns(facetDocs) }
        : base;

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
