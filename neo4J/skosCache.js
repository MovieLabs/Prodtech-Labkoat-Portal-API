/**
 * Maintain the server side cache of the SKOS database, in same format as client side
 */
const neoCache = require('./neoCache');

const skosMap = { nodes: {}, edges: {} };

function setCache() {
    // Retrieve the Skos data from the cache, formatted as Neo4J parameters
    const conceptScheme = neoCache.getConceptScheme();
    const concept = neoCache.getConcept();
    const label = neoCache.getLabel();
    const edgeLabel = neoCache.edgeLabel(['altLabel', 'prefLabel']);
    const edgeTopConcept = neoCache.edgeLabel(['hasTopConcept']);
    const edgeNarrower = neoCache.edgeLabel(['narrower']);
    const edgeScheme = neoCache.edgeLabel(['inScheme']);

    const nodesArr = [...conceptScheme.ConceptScheme, ...concept.Concept, ...label.Label];
    const edgesArr = [...edgeLabel, ...edgeTopConcept, ...edgeNarrower, ...edgeScheme];
    nodesArr.forEach((n) => {
        skosMap.nodes[n.id] = n;
    });

    edgesArr.forEach((e) => {
        if (skosMap.edges[e.sourceId]) {
            const edgeString = JSON.stringify(e);
            const edgeExists = skosMap.edges[e.sourceId].filter((se) => JSON.stringify(se) === edgeString);
            if (edgeExists.length) return; // Skip duplicates
            skosMap.edges[e.sourceId].push(e);
        } else {
            skosMap.edges[e.sourceId] = [e];
        }
    });
}

function getCache() {
    return skosMap;
}

function updateAction(action) {
    if (action.create) {
        action.create.forEach((c) => {
            if (c.sourceId) {
                const { sourceId } = c;
                skosMap.edges[sourceId] = skosMap.edges[sourceId] ? [...skosMap.edges[sourceId], c] : [c];
                console.log(skosMap.edges[sourceId]);
                console.log();
            } else {
                const { id } = c;
                skosMap.nodes[id] = c;
            }
        });
    }
    if (action.update) {
        action.update.forEach((c) => {
            if (c.sourceId) {
                const { sourceId } = c;
                skosMap.edges[sourceId] = skosMap.edges[sourceId] ? [...skosMap.edges[sourceId], c] : [c];
                console.log(skosMap.edges[sourceId]);
                console.log();
            } else {
                const { id } = c;
                Object.keys(c)
                    .forEach((k) => {
                        skosMap.nodes[id][k] = c[k];
                    });
            }
        });
    }
    if (action.delete) {
        action.delete.forEach((d) => {
            if (d.sourceId) {
                const { sourceId } = d;
                const keepEdges = skosMap.edges[sourceId].filter((e) => {
                    return !(e.targetId === d.targetId && e.relation === d.relation);
                });
                skosMap.edges[sourceId] = keepEdges;
            }
        });
    }
    return true;
}

module.exports = {
    setCache,
    getCache,
    updateAction,
};
