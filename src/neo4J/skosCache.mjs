/**
 * Maintain the server side cache of the SKOS database, in same format as client side
 */
import neoCache from './neoCache.mjs';
import {
    getNode, getType, getRelated, cacheUpdate,
} from './dictionaryUtilities.mjs';

let skosMap;

function computeSkosCache() {
    // Retrieve the Skos data from the cache, formatted as Neo4J parameters
    const conceptScheme = neoCache.getConceptScheme();
    const concept = neoCache.getConcept();
    const label = neoCache.getLabel();
    const root = neoCache.getRoot('Root', 'SKOS');
    const edgeLabel = neoCache.edgeLabel(['altLabel', 'prefLabel']);
    const edgeTopConcept = neoCache.edgeLabel(['hasTopConcept', 'topConceptOf']);
    const edgeNarrower = neoCache.edgeLabel(['narrower', 'broader']);
    const edgeScheme = neoCache.edgeLabel(['hasScheme', 'inScheme']);

    const nodesArr = [...root, ...conceptScheme, ...concept, ...label];
    const edgesArr = [...edgeLabel, ...edgeTopConcept, ...edgeNarrower, ...edgeScheme];

    const cache = {
        nodes: {},
        edges: {},
    };

    nodesArr.forEach((n) => {
        cache.nodes[n.id] = n;
        cache.edges[n.id] = []; // Create an entry for the edge to protect against nodes without relations
    });

    edgesArr.forEach((e) => {
        if (cache.edges[e.sourceId]) {
            const edgeString = JSON.stringify(e);
            const edgeExists = cache.edges[e.sourceId].filter((se) => JSON.stringify(se) === edgeString);
            if (edgeExists.length) return; // Skip duplicates
            cache.edges[e.sourceId].push(e);
        } else {
            cache.edges[e.sourceId] = [e];
        }
    });
    return cache;
}

function setCache(newSkosMap) {
    const dictProto = Object.create({
        getNode,
        getType,
        getRelated,
        cacheUpdate,
    });
    skosMap = Object.assign(dictProto, newSkosMap);
    return skosMap;
}

function getCache() {
    return skosMap;
}

function compareSkosCache() {
    const error = []; // Does the updated skosMap and the updates done to Neo4J mirror one another
    const cache = computeSkosCache();
    const cacheNodes = Object.keys(cache.nodes)
        .sort();
    const skosNodes = Object.keys(skosMap.nodes)
        .sort();
    if (cacheNodes.toString() !== skosNodes.toString()) {
        error.push({
            message: 'The Edge keys do not match',
            data: {
                cache: cacheNodes,
                skosMap: skosNodes,
            },
        });
    }
    const cacheEdges = Object.keys(cache.edges)
        .sort();
    const skosEdges = Object.keys(skosMap.edges)
        .sort();
    if (cacheEdges.toString() !== skosEdges.toString()) {
        error.push({
            message: 'The Edge keys do not match',
            data: {
                cache: cacheEdges,
                skosMap: skosEdges,
            },
        });
    }

    const nodeCompare = [];
    cacheNodes.forEach((key) => {
        if (JSON.stringify(cache.nodes[key]) !== JSON.stringify(skosMap.nodes[key])) nodeCompare.push(key);
    });

    const edgeCompare = [];
    cacheEdges.forEach((key) => {
        if (!cache.edges[key] || !skosMap.edges[key]) return; // Something has been deleted
        const allCacheEdges = JSON.stringify(cache.edges[key].sort());
        const allSkosEdges = JSON.stringify(skosMap.edges[key].sort());
        if (allCacheEdges !== allSkosEdges) edgeCompare.push(key);
    });

    if (nodeCompare.length) {
        error.push({
            message: 'There are Nodes with discrepancies between them',
            data: {
                cache: nodeCompare.map((key) => ({ [key]: cacheNodes[key] })),
                skosMap: nodeCompare.map((key) => ({ [key]: skosNodes[key] })),
            },
        });
    }
    if (edgeCompare.length) {
        error.push({
            message: 'There are Edges with discrepancies between them',
            data: {
                cache: edgeCompare.map((key) => ({ [key]: cacheEdges[key] })),
                skosMap: edgeCompare.map((key) => ({ [key]: skosEdges[key] })),
            },
        });
    }
    return error.length ? null : error;
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
                if (!skosMap.edges[id]) skosMap.edges[id] = []; // Ensure there is an entry for the edges
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
                skosMap.edges[sourceId] = skosMap.edges[sourceId].filter((e) => {
                    return !(e.targetId === d.targetId && e.relation === d.relation);
                });
            } else {
                const { id } = d;
                delete skosMap.nodes[id];
                delete skosMap.edges[id];
            }
        });
    }
    return true;
}

async function loadCache(neo4Jdb) {
    try {
        // Load up the Skos graph into the cache
        neoCache.deleteSkosRoot();
        neoCache.deleteConceptScheme(); // Clear the database cache
        neoCache.deleteConcept();
        neoCache.deleteLabel();

        const root = await neo4Jdb.query('getSkosRoot'); // Root node
        neoCache.add(root);
        const hierarchy = await neo4Jdb.query('getHierarchy'); // Top concepts and narrower
        neoCache.add(hierarchy);
        const scheme = await neo4Jdb.query('getScheme'); // Setup the cache
        neoCache.add(scheme);
        const topConcept = await neo4Jdb.query('getTopConceptOf');
        neoCache.add(topConcept);
        const concept = await neo4Jdb.query('getConcept');
        neoCache.add(concept);
        const label = await neo4Jdb.query('getLabel');
        neoCache.add(label);

        const newSkosMap = computeSkosCache(); // Compute the new skosMap from the loaded data

        if (skosMap) { // Compare the cache if this is not loading for the first time
            const error = compareSkosCache(); // Compare the old SKOS cache to the new loaded data
            console.log('Differences between Neo4J and cached database');
            console.log(error);
        }

        setCache(newSkosMap); // Setup the server side cache for the front (uses the cached raw neo4J responses)
        console.log('Internal SKOS cache has been reloaded');
        return true;
    } catch (err) {
        console.log(err);
        console.log(`Connection error\n${err}\nCause: ${err.cause}`);
        return false; // ToDo: Handle this with an error.
    }
}

export default {
    setCache,
    getCache,
    compareCache: compareSkosCache,
    updateAction,
    loadCache,
};
