/**
 * Internal cache of the Neo4J database, indexed by their internal element identifiers
 */

const { makeArray } = require('../helpers/util');

const neoCache = {
    nodes: {},
    edges: {},
};

/**
 * Add data from the Neo4J query results into the internal Neo4J cache
 * @param data
 */

function add(data) {
    const { records } = data;
    records.forEach((r) => {
        const fields = r._fields.filter((f) => f); // Remove null fields (returned when using optional MATCH)
        fields.forEach((f) => {
            if (f.labels) { // Nodes have labels
                neoCache.nodes[f.elementId] = f;
            } else {
                const f1 = makeArray(f); // Otherwise, it's an edge
                f1.forEach((f2) => {
                    neoCache.edges[f2.elementId] = f2;
                });
            }
        });
    });
}

/**
 * Delete a node type from the cache, along with associated edges
 * @param nodeType {string}
 * @returns {*}
 */

function deleteNode(nodeType) {
    // Remove nodes of the requested type
    const id = Object.keys(neoCache.nodes)
        .filter((nId) => neoCache.nodes[nId].labels.includes(nodeType));
    id.forEach((nId) => {
        delete neoCache.nodes[nId];
    });
    // Remove any associated edges
    Object.keys(neoCache.edges).forEach((eId) => {
        const remove = (id.includes(neoCache.edges[eId].startNodeElementId)
            || id.includes(neoCache.edges[eId].endNodeElementId));
        if (remove) delete neoCache.edges[eId];
    });
    return nodeType;
}

/**
 * Retrieve all nodes of the requested type from the neo4J Cache
 * @param nodeType {string}
 * @returns {{ConceptScheme: any[]}}
 */

function getNode(nodeType) {
    return Object.keys(neoCache.nodes)
        .filter((eId) => neoCache.nodes[eId].labels.includes(nodeType))
        .map((eId) => neoCache.nodes[eId].properties);
}

/**
 * Return all edges for the requested relationship type
 * @param relType {string}
 * @returns {{sourceId: *, targetId: *, sourceType: *, targetType: *, relation: *}[]}
 */
function edgeLabel(relType) {
    const lblEdges = Object.keys(neoCache.edges)
        .filter((eId) => relType.includes(neoCache.edges[eId].type));
    // console.log(`Relationship Type: ${relType}`);
    // console.log(lblEdges);
    const t = lblEdges.map((eId) => {
        const {
            startNodeElementId,
            endNodeElementId,
        } = neoCache.edges[eId];
        if (!neoCache.nodes[startNodeElementId]) {
            console.log(`Missing node: ${startNodeElementId}`);
        }
        if (!neoCache.nodes[endNodeElementId]) {
            console.log(`Missing node: ${endNodeElementId}`);
        }
        const sourceNode = neoCache.nodes[startNodeElementId];
        const targetNode = neoCache.nodes[endNodeElementId];
        try {
            return {
                sourceId: sourceNode.properties.id,
                sourceType: sourceNode.labels.filter((l) => l !== 'SKOS')[0],
                targetId: targetNode.properties.id,
                targetType: targetNode.labels.filter((l) => l !== 'SKOS')[0],
                relation: neoCache.edges[eId].type,
            };
        } catch (err) {
            console.log('Missing node data');
            console.log(sourceNode);
            console.log(targetNode);
            console.log();
            return null;
        }
    });
    return t.filter((n) => n);
}

module.exports = {
    add,
    deleteConceptScheme: () => deleteNode('ConceptScheme'),
    deleteConcept: () => deleteNode('Concept'),
    deleteLabel: () => deleteNode('Label'),
    deleteRoot: () => deleteNode('Root'),
    deleteEntity: () => deleteNode('Entity'),
    deleteProperty: () => deleteNode('Property'),
    deleteClass: () => deleteNode('Class'),
    deleteValue: () => deleteNode('ControlledValue'),
    getConceptScheme: () => getNode('ConceptScheme'),
    getConcept: () => getNode('Concept'),
    getLabel: () => getNode('Label'),
    getRoot: () => getNode('Root'),
    getClass: () => getNode('Class'),
    getProperty: () => getNode('Property'),
    getEntity: () => getNode('Entity'),
    getControlledValue: () => getNode('ControlledValue'),
    edgeLabel,
};
