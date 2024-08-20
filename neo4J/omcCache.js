/**
 * Maintain the server side cache of the SKOS database, in same format as client side
 */
const neoCache = require('./neoCache');
const tempCache = require('../controllers/vocabulary/omcJsonData.json');
const { asyncQueue } = require('../helpers/util');

let omcMap;

function computeOmcCache() {
    // Retrieve the Skos data from the cache, formatted as Neo4J parameters
    const omcRoot = neoCache.getRoot();
    const omcProperty = neoCache.getProperty();
    const omcEntity = neoCache.getEntity();
    const omcClass = neoCache.getClass();
    const omcValue = neoCache.getControlledValue();
    const omcSchema = neoCache.getOmcSchema();
    const edgeRepresent = neoCache.edgeLabel(['represents', 'representedBy']);
    const edgeProperty = neoCache.edgeLabel(['hasProperty', 'propertyOf']);
    const edgeSkos = neoCache.edgeLabel(['hasSkosDefinition']);
    const edgeValue = neoCache.edgeLabel(['hasControlledValue', 'controlledValueFor', 'hasSubValue', 'subValueFor']);
    const edgeSchema = neoCache.edgeLabel(['schemaChild', 'hasValue']);

    const nodesArr = [...omcRoot, ...omcProperty, ...omcEntity, ...omcClass, ...omcValue, ...omcSchema];
    const edgesArr = [...edgeRepresent, ...edgeProperty, ...edgeSkos, ...edgeValue, ...edgeSchema];

    const cache = {
        nodes: {},
        edges: {},
    };

    nodesArr.forEach((n) => {
        cache.nodes[n.id] = n;
        cache.edges[n.id] = [];
    });

    edgesArr.forEach((e) => {
        const edgeString = JSON.stringify(e);
        const edgeExists = cache.edges[e.sourceId].filter((se) => JSON.stringify(se) === edgeString);
        if (edgeExists.length) return; // Skip duplicates
        cache.edges[e.sourceId].push(e);
    });
    return cache;
}

function setCache(newSkosMap) {
    omcMap = newSkosMap;
    return omcMap;
}

function getCache() {
    return omcMap;
}

function compareOmcCache(updatedCache) {
    const error = []; // Does the updated skosMap and the updates done to Neo4J mirror one another

    const compareNodes = ((c1, c2, name) => {
        const keys = Object.keys(c1);
        keys.forEach((nId) => {
            if (!c2[nId]) {
                console.log(`${nId} is missing from ${name} cache`);
                return;
            }
            const node1 = JSON.stringify(c1[nId]);
            const node2 = JSON.stringify(c2[nId]);
            if (node1 !== node2) {
                console.log(`${nId} has different properties`);
                console.log(c1[nId]);
                console.log(c2[nId]);
                console.log();
            }
        });
    });

    compareNodes(updatedCache.nodes, omcMap.nodes, 'Old');
    compareNodes(omcMap.nodes, updatedCache.nodes, 'Updated');

    const cacheEdges = Object.keys(updatedCache.edges)
        .sort();
    const omcEdges = Object.keys(omcMap.edges)
        .sort();
    if (cacheEdges.toString() !== omcEdges.toString()) {
        error.push({
            message: 'The Edge keys do not match',
            data: {
                cache: cacheEdges,
                skosMap: omcEdges,
            },
        });
    }
    //
    // const nodeCompare = [];
    // cacheNodes.forEach((key) => {
    //     if (JSON.stringify(updatedCache.nodes[key]) !== JSON.stringify(omcMap.nodes[key])) nodeCompare.push(key);
    // });

    const edgeCompare = [];
    cacheEdges.forEach((key) => {
        try {
            const allCacheEdges = JSON.stringify(updatedCache.edges[key].sort());
            const allOmcEdges = JSON.stringify(omcMap.edges[key].sort());
            if (allCacheEdges !== allOmcEdges) edgeCompare.push(key);
        } catch (err) {
            console.log(key);
        }
    });

    // if (nodeCompare.length) {
    //     error.push({
    //         message: 'There are Nodes with discrepancies between them',
    //         data: {
    //             cache: nodeCompare.map((key) => ({ [key]: cacheNodes[key] })),
    //             skosMap: nodeCompare.map((key) => ({ [key]: omcNodes[key] })),
    //         },
    //     });
    // }
    if (edgeCompare.length) {
        error.push({
            message: 'There are Edges with discrepancies between them',
            data: {
                cache: edgeCompare.map((key) => ({ [key]: cacheEdges[key] })),
                skosMap: edgeCompare.map((key) => ({ [key]: omcEdges[key] })),
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
                omcMap.edges[sourceId] = omcMap.edges[sourceId] ? [...omcMap.edges[sourceId], c] : [c];
                console.log(omcMap.edges[sourceId]);
                console.log();
            } else {
                const { id } = c;
                omcMap.nodes[id] = c;
                omcMap.edges[id] = [];
            }
        });
    }
    if (action.update) {
        action.update.forEach((c) => {
            if (c.sourceId) {
                const { sourceId } = c;
                omcMap.edges[sourceId] = omcMap.edges[sourceId] ? [...omcMap.edges[sourceId], c] : [c];
                console.log(omcMap.edges[sourceId]);
                console.log();
            } else {
                const { id } = c;
                Object.keys(c)
                    .forEach((k) => {
                        omcMap.nodes[id][k] = c[k];
                    });
            }
        });
    }
    if (action.delete) {
        action.delete.forEach((d) => {
            if (d.sourceId) {
                const { sourceId } = d;
                omcMap.edges[sourceId] = omcMap.edges[sourceId].filter((e) => {
                    return !(e.targetId === d.targetId && e.relation === d.relation);
                });
            } else {
                const { id } = d;
                if (omcMap.nodes[id]) delete omcMap.nodes[id];
                if (omcMap.edges[id]) delete omcMap.edges[id];
                Object.keys(omcMap.edges)
                    .forEach((sourceId) => {
                        const keepEdges = omcMap.edges[sourceId].filter((e) => !(e.targetId !== id));
                        omcMap.edges[sourceId] = keepEdges;
                    });
            }
        });
    }
    return true;
}

async function loadCache(neo4Jdb) {
    try {
        // Load up the OMC graph into the cache
        neoCache.deleteProperty(); // Clear the database cache
        neoCache.deleteEntity();
        neoCache.deleteClass();
        neoCache.deleteValue();
        neoCache.deleteRoot();
        neoCache.deleteSchema();

        const omcRoot = await neo4Jdb.query('getOmcRoot'); // Top concepts and narrower
        neoCache.add(omcRoot);
        const omcClass = await neo4Jdb.query('getOmcClass'); // Top concepts and narrower
        neoCache.add(omcClass);
        neoCache.add(await neo4Jdb.query('getOmcEntity'));
        neoCache.add(await neo4Jdb.query('getOmcProperty'));
        const omcValue = await neo4Jdb.query('getOmcControlledValue');
        neoCache.add(omcValue);
        const omcSchema = await neo4Jdb.query('getOmcSchema');
        neoCache.add(omcSchema);

        const newOmcMap = computeOmcCache(); // Compute the new skosMap from the loaded data

        if (omcMap) { // Compare the cache if this is not loading for the first time
            const error = compareOmcCache(newOmcMap); // Compare the old SKOS cache to the new loaded data
        }

        setCache(newOmcMap); // Setup the server side cache for the front (uses the cached raw neo4J responses)
        console.log('Internal OMC cache has been reloaded');
        return true;
    } catch (err) {
        console.log(err);
        console.log(`Connection error\n${err}\nCause: ${err.cause}`);
        return false; // ToDo: Handle this with an error.
    }
}

module.exports = {
    setCache,
    getCache,
    compareCache: compareOmcCache,
    updateAction,
    loadCache,
};
