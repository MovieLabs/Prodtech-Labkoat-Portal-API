/**
 *
 * @type {{add: function(*): void}|{add?: function(*): void}}
 */

const neoCache = require('./neoCache');
const {
    makeArray,
    hasProp,
} = require('../helpers/util');

// Create a Map of the SKOS data with id's used as the keys
function createSkosMap({
    nodes,
    edges,
}) {
    const sM1 = nodes.Concept.reduce((obj, n) => ({ ...obj, ...{ [n.id]: n } }), {});
    const sM2 = nodes.ConceptScheme.reduce((obj, n) => ({ ...obj, ...{ [n.id]: n } }), sM1);
    return {
        nodes: nodes.Label.reduce((obj, n) => ({ ...obj, ...{ [n.id]: n } }), sM2),
        edges: edges.reduce((obj, e) => {
            const arr = obj[e.sourceId] ? [...obj[e.sourceId], e] : [e];
            return { ...obj, ...{ [e.sourceId]: arr } };
        }, {}),
    };
}

const prefLabelRelations = ((id, skosMap) => skosMap.edges[id].filter((se) => se.relation === 'prefLabel')
    .map((se) => skosMap.nodes[se.targetId]));

const altLabelRelations = ((id, skosMap) => skosMap.edges[id].filter((ae) => ae.relation === 'altLabel')
    .map((ae) => skosMap.nodes[ae.targetId]));

const inSchemeRelations = ((id, skosMap) => skosMap.edges[id].filter((e) => e.relation === 'inScheme')
    .map((e) => skosMap.nodes[e.targetId]));

// Return row based data for each Concept that is in the requested schemes
function tableScheme(skosData, scheme) {
    const s = makeArray(scheme);
    const skosMap = createSkosMap(skosData);
    const {
        edges,
        nodes,
    } = skosData;
    const schId = nodes.ConceptScheme.filter((n) => s.includes(n.prefLabel))
        .map((n) => n.id);
    const inSchemeEdges = edges.filter((e) => schId.includes(e.targetId) && e.relation === 'inScheme');
    const rows = inSchemeEdges.map((e) => ({
        ...{
            scheme: skosMap.nodes[e.targetId].prefLabel, // The requested scheme
            schemeId: e.targetId,
        },
        ...skosMap.nodes[e.sourceId], // Core information
        ...{ prefLabel: prefLabelRelations(e.sourceId, skosMap)[0] }, // Preferred label
        ...{ altLabel: altLabelRelations(e.sourceId, skosMap) }, // Alternate labels
        ...{ inScheme: inSchemeRelations(e.sourceId, skosMap) }, // Scheme this concept is in
    }));
    return rows;
}

// Create a Hierarchical structure for each Scheme, with children containing narrower concepts
function hierarchy(skosData, scheme) {
    const s = makeArray(scheme);
    const { edges, nodes } = skosData;
    const skosMap = createSkosMap(skosData);
    let id = 0;

    // Recurse down the vocabulary add the narrower concepts as children
    const narrower = ((nodeIds) => nodeIds.map((nId) => ({
        name: skosMap.nodes[nId].prefLabel,
        nodeId: `id-${id++}`,
        entityType: 'Concept',
        ...skosMap.nodes[nId],
        // data: skosMap.nodes[nId],
        children: narrower(skosMap.edges[nId].filter((e) => e.relation === 'narrower')
            .map((e) => e.targetId)),
    })));

    // Find the ConceptSchemes that match the requested schemes
    const schId = nodes.ConceptScheme.filter((n) => s.includes(n.prefLabel))
        .map((n) => n.id);

    // Build a hierarchy for each requested scheme
    const allSchemes = schId.map((sId) => {
        const tcId = edges.filter((e) => sId === e.sourceId && e.relation === 'hasTopConcept')
            .map((e) => e.targetId);
        const n = narrower(tcId);
        return {
            name: skosMap.nodes[sId].prefLabel,
            nodeId: `id-${id++}`,
            entityType: 'ConceptScheme',
            ...skosMap.nodes[sId],
            // data: skosMap.nodes[sId],
            children: n,
        };
    });

    return {
        name: 'Vocabulary',
        nodeId: `id-${id++}`,
        entityType: 'Root',
        data: {},
        children: allSchemes,
    };
}

// Return the names of all the schemes in this vocabulary
function schemeNames(skosData) {
    const { nodes } = skosData;
    return nodes.ConceptScheme.map((n) => n.prefLabel);
}

async function fetchNeo4J(cypher, db, dbDatabase) {
    const params = {};
    try {
        const node = await db.executeQuery(
            cypher,
            params,
            {
                database: dbDatabase,
                bookmarkManager: null,
            },
        );
        return node;
    } catch (err) {
        console.log('Error: Entity did not resolve');
        console.log(err);
        return null;
    }
}

/**
 * Execute a query to the Neo4J database and cache the result in the internal cache
 * @type {{getScheme: string, getLabel: string, getConcept: string}}
 */

const neoQueries = {
    getScheme: `MATCH(concept:Concept)-[rel:inScheme]->(scheme:ConceptScheme)
RETURN concept, scheme, rel
    `,
    getConcept: `MATCH(concept:Concept)-[rel:narrower|broader]->(:Concept)
RETURN concept, rel`,
    getLabel: `MATCH(concept:Concept)-[lbl:prefLabel|altLabel]->(label:Label)
RETURN concept, label, lbl`,
    getHierarchy: `MATCH (scheme:ConceptScheme)-[tcEdge:hasTopConcept]-(concept:Concept)
OPTIONAL MATCH (concept)-[nEdge:narrower *1..2]-(nConcept:Concept)
RETURN scheme, concept, nConcept, tcEdge, nEdge`,
};

async function neoQuery(query, db, dbDatabase) {
    if (!hasProp(neoQueries, query)) {
        console.log('Request to Neo4J database failed, no such query name');
        return;
    }
    const cypher = neoQueries[query];
    const schemeQuery = await fetchNeo4J(cypher, db, dbDatabase);
    if (!schemeQuery) return;
    neoCache.add(schemeQuery);
}

module.exports = {
    tableScheme,
    hierarchy,
    schemeNames,
    neoQuery,
};
