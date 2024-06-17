/**
 * Internal cache of the Neo4J database, indexed by their internal element identifiers
 */

const { makeArray } = require('../helpers/util');

const cache = {};

function resetCache() {
    cache.nodes = {};
    cache.edges = {};
}

function add(data) {
    const { records } = data;
    records.forEach((r) => {
        const fields = r._fields.filter((f) => f); // Remove null fields (returned when using optional MATCH)
        fields.forEach((f) => {
            if (f.labels) { // Nodes have labels
                cache.nodes[f.elementId] = f;
            } else {
                const f1 = makeArray(f); // Otherwise, it's an edge
                f1.forEach((f2) => {
                    cache.edges[f2.elementId] = f2;
                });
            }
        });
    });
}

function getConceptScheme() {
    const ConceptScheme = Object.keys(cache.nodes)
        .filter((eId) => cache.nodes[eId].labels.includes('ConceptScheme'))
        .map((eId) => cache.nodes[eId].properties);
    return { ConceptScheme };
}

function getConcept() {
    const Concept = Object.keys(cache.nodes)
        .filter((eId) => cache.nodes[eId].labels.includes('Concept'))
        .map((eId) => cache.nodes[eId].properties);
    return { Concept };
}

function getLabel() {
    const Label = Object.keys(cache.nodes)
        .filter((eId) => cache.nodes[eId].labels.includes('Label'))
        .map((eId) => cache.nodes[eId].properties);
    return { Label };
}

function edgeLabel(relType) {
    const lblEdges = Object.keys(cache.edges)
        .filter((eId) => relType.includes(cache.edges[eId].type));
    return lblEdges.map((eId) => {
        const {
            startNodeElementId,
            endNodeElementId,
        } = cache.edges[eId];
        const sourceNode = cache.nodes[startNodeElementId];
        const targetNode = cache.nodes[endNodeElementId];
        return {
            sourceId: sourceNode.properties.id,
            sourceType: sourceNode.labels.filter((l) => l !== 'SKOS')[0],
            targetId: targetNode.properties.id,
            targetType: targetNode.labels.filter((l) => l !== 'SKOS')[0],
            relation: cache.edges[eId].type,
        };
    });
}

module.exports = {
    resetCache,
    add,
    getConceptScheme,
    getConcept,
    getLabel,
    edgeLabel,
};
