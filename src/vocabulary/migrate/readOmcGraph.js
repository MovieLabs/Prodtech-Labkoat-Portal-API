/**
 * Read the OMC-JSON graph out of Neo4j — the *second* graph, the one the OMC Json Editor authors.
 *
 * ## Two graphs, joined by a string
 *
 * Neo4j holds two disjoint structures. The SKOS one (`n:SKOS`) is the vocabulary. This one
 * (`n:OMC`) describes OMC-JSON itself: entities, their properties, and the controlled values a
 * property admits. The only thing connecting them is a `hasSkosDefinition` edge from an OMC node to
 * a SKOS Concept — **and there is no integrity behind it**. Nothing requires a controlled value to
 * have one, nothing checks that the concept it names still exists, and nothing notices when a term
 * is renamed out from under it.
 *
 * 110 of the 293 controlled values carry one. The other 183 are strings with definitions attached
 * to nothing.
 *
 * Merging the two dissolves that: a controlled value with a definition *becomes* a placement of
 * that term, and one without becomes a term in its own right. Afterwards there is one term store
 * and two collections over it, and the string join is gone.
 *
 * ## Why this does not use `neo4JInterface.query()`
 *
 * The same reason `readGraph.js` does not — those queries were written to fill a cache, and each
 * carries a filter that is right for that and wrong for a migration. `getOmcProperty` is a chain of
 * `OPTIONAL MATCH`es that returns a row per combination, which is fine for a cache that de-duplicates
 * and hopeless for counting. This reads nodes and edges flat and reassembles the shape in JS, where
 * getting it wrong is visible.
 *
 * @module vocabulary/migrate/readOmcGraph
 */

/** Every node in the OMC graph, whatever kind. */
const ALL_NODES = 'MATCH (n:OMC) RETURN n, labels(n) AS labels';

/** Every edge inside the OMC graph. */
const ALL_EDGES = 'MATCH (a:OMC)-[e]->(b:OMC) RETURN a.id AS source, type(e) AS relation, b.id AS target';

/**
 * The join to the vocabulary.
 *
 * Undirected in the pattern, directed in what it returns. The writer emits this edge in one
 * direction, but the service's own query (`getOmcSkos`) reads it undirected, so a graph written by
 * some earlier version could hold either — and a migration that assumed a direction would silently
 * find nothing.
 */
const SKOS_LINKS = 'MATCH (a:OMC)-[:hasSkosDefinition]-(b:SKOS) RETURN a.id AS omc, b.id AS concept';

/**
 * @typedef {object} OmcGraph
 * @property {Map<string, object>} nodes - id → properties, with `labels` added
 * @property {Array<{source: string, relation: string, target: string}>} edges
 * @property {Map<string, string[]>} skosLinks - OMC id → the SKOS concept ids it points at
 */

/**
 * Read the whole OMC graph.
 *
 * @param {object} neo - A `VocabNeo4j` instance
 * @returns {Promise<OmcGraph>}
 */
export async function readOmcGraph(neo) {
    const { driver, dbDatabase } = neo;
    const options = { database: dbDatabase, bookmarkManager: null };

    const [nodeResult, edgeResult, linkResult] = await Promise.all([
        driver.executeQuery(ALL_NODES, {}, options),
        driver.executeQuery(ALL_EDGES, {}, options),
        driver.executeQuery(SKOS_LINKS, {}, options),
    ]);

    const nodes = new Map();
    nodeResult.records.forEach((record) => {
        const { properties } = record.get('n');
        if (!properties?.id) return;
        nodes.set(properties.id, {
            ...properties,
            labels: record.get('labels').filter((label) => label !== 'OMC'),
        });
    });

    const edges = edgeResult.records
        .map((record) => ({
            source: record.get('source'),
            relation: record.get('relation'),
            target: record.get('target'),
        }))
        .filter((edge) => edge.source && edge.target);

    const skosLinks = new Map();
    linkResult.records.forEach((record) => {
        const omc = record.get('omc');
        const concept = record.get('concept');
        if (!omc || !concept) return;
        if (!skosLinks.has(omc)) skosLinks.set(omc, []);
        // A node linked to the same concept twice is one link, not two.
        if (!skosLinks.get(omc).includes(concept)) skosLinks.get(omc).push(concept);
    });

    return { nodes, edges, skosLinks };
}

/**
 * Group edges for lookup in both directions.
 *
 * @param {OmcGraph} graph
 * @returns {{out: Map<string, Array<object>>, in: Map<string, Array<object>>}}
 */
export function indexOmcEdges(graph) {
    const out = new Map();
    const inbound = new Map();
    graph.edges.forEach((edge) => {
        if (!out.has(edge.source)) out.set(edge.source, []);
        out.get(edge.source).push(edge);
        if (!inbound.has(edge.target)) inbound.set(edge.target, []);
        inbound.get(edge.target).push(edge);
    });
    return { out, in: inbound };
}

/**
 * Targets of a relation from a node, de-duplicated.
 *
 * @param {Map<string, Array<object>>} index
 * @param {string} id
 * @param {string} relation
 * @returns {string[]}
 */
export const omcRelatedTo = ((index, id, relation) => [...new Set((index.get(id) ?? [])
    .filter((edge) => edge.relation === relation)
    .map((edge) => edge.target))]);

/**
 * Does this node carry the given Neo4j label?
 *
 * @param {object} node
 * @param {string} label
 * @returns {boolean}
 */
export const isKind = ((node, label) => (node?.labels ?? []).includes(label));

/**
 * What the OMC graph contains, and what is wrong with it, before anything is built.
 *
 * Every number here is checkable by hand against the live database, which is the point: a merge
 * that quietly loses a controlled value is caught by a count rather than by a schema that stopped
 * validating six months later.
 *
 * @param {OmcGraph} graph
 * @returns {object}
 */
export function auditOmcGraph(graph) {
    const byKind = {};
    graph.nodes.forEach((node) => {
        const kind = (node.labels ?? []).join(':') || '(no label)';
        byKind[kind] = (byKind[kind] ?? 0) + 1;
    });

    const byRelation = {};
    const pairs = {};
    graph.edges.forEach((edge) => {
        byRelation[edge.relation] = (byRelation[edge.relation] ?? 0) + 1;
        pairs[edge.relation] ??= new Set();
        pairs[edge.relation].add(`${edge.source}|${edge.target}`);
    });

    const duplicated = Object.entries(byRelation)
        .map(([relation, total]) => ({ relation, total, distinct: pairs[relation].size }))
        .filter((entry) => entry.total > entry.distinct);

    // `hasSubValue` from a Property rather than from a ControlledValue. Eight of these exist, and
    // they are a data error with a harmless reading: a value hung off a property by the wrong edge
    // type is still a top-level value of that property. Treated as `hasControlledValue` and counted,
    // rather than dropped — dropping them would lose `script`, `proxy`, `timeline` and `color` from
    // the Asset function list, four values a schema depends on.
    const misfiledSubValues = graph.edges.filter((edge) => edge.relation === 'hasSubValue'
        && !isKind(graph.nodes.get(edge.source), 'ControlledValue'));

    const values = [...graph.nodes.values()].filter((node) => isKind(node, 'ControlledValue'));
    const linked = values.filter((node) => graph.skosLinks.has(node.id));

    // A controlled value nothing points at cannot be reached by a walk, so it would vanish from the
    // merge without a word.
    const reached = new Set(graph.edges
        .filter((edge) => ['hasControlledValue', 'hasSubValue'].includes(edge.relation))
        .map((edge) => edge.target));
    const unreachable = values.filter((node) => !reached.has(node.id));

    // A value pointing at more than one concept has to pick one, and picking silently is how a
    // vocabulary ends up asserting something nobody chose.
    const ambiguous = [...graph.skosLinks.entries()]
        .filter(([, concepts]) => concepts.length > 1)
        .map(([omc, concepts]) => ({ omc, concepts }));

    const dangling = graph.edges.filter(
        (edge) => !graph.nodes.has(edge.source) || !graph.nodes.has(edge.target),
    );

    return {
        nodeCount: graph.nodes.size,
        edgeCount: graph.edges.length,
        byKind,
        byRelation,
        controlledValues: values.length,
        withSkosDefinition: linked.length,
        skosLinksTotal: graph.skosLinks.size,
        problems: {
            misfiledSubValues: misfiledSubValues.length,
            misfiledSample: misfiledSubValues.slice(0, 5),
            unreachable: unreachable.length,
            unreachableSample: unreachable.slice(0, 5).map((node) => ({ id: node.id, label: node.label })),
            ambiguous,
            dangling: dangling.length,
            duplicated,
        },
    };
}
