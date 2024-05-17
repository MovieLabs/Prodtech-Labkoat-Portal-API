/**
 Create the query patterns for update the Neo4J database
 * */

const skosToLabel = {
    'skos:Concept': 'Concept',
    'skos:ConceptScheme': 'ConceptScheme',
    'skosxl:Label': 'Label',
};

function updateNodes(omcVocab) {
    const nodeTypes = omcVocab.reduce((obj, v) => {
        const entityType = skosToLabel[v.type] || 'SKOS'; // If entityType is unknown, use 'OMC'
        obj[entityType] = obj[entityType] ? obj[entityType] : [];
        obj[entityType].push(v);
        return obj;
    }, {});

    const cypherBatch = Object.keys(nodeTypes)
        .map((entityType) => {
            const props = new Set(); // Extract the props this entity uses
            nodeTypes[entityType].forEach((e) => Object.keys(e)
                .forEach((f) => props.add(f))); // All params for the entityType
            let cypherProps = ''; // Construct the appropriate cypher to set the props
            props.forEach((p) => {
                cypherProps += `SET n.${p} = node.${p}\n`;
            });

            return {
                cypher: `WITH $params as batch
                UNWIND batch as node
                MERGE (n: SKOS{id:node.id})
                SET n: ${entityType}
                ${cypherProps}
            `,
                params: nodeTypes[entityType],
            };
        });
    return cypherBatch;
}

function deleteNodes(omcVocab) {
    return [{
        cypher: `WITH $params as batch
        UNWIND batch as node
        MATCH (sEnt: SKOS{id: node.id})
        DETACH DELETE sEnt
        RETURN sEnt
    `,
        params: omcVocab,
    }];
}

const sortEdges = ((omcVocab) => omcVocab.reduce((obj, params) => {
    const { relation } = params;
    obj[relation] = obj[relation] ? obj[relation] : [];
    obj[relation].push(params);
    return obj;
}, {}));

function deleteEdges(omcVocab) {
    const edgeTypes = sortEdges(omcVocab);
    return Object.keys(edgeTypes)
        .map((relation) => ({
            cypher: `WITH $params as batch
        UNWIND batch as edge
        MATCH (sEnt: SKOS{id: edge.sourceId})-[e: ${relation}]->(tEnt: SKOS{id: edge.targetId})
        DELETE e
        RETURN e
    `,
            params: edgeTypes[relation],
        }));
}

function updateEdges(omcVocab) {
    const edgeTypes = sortEdges(omcVocab);
    return Object.keys(edgeTypes)
        .map((relation) => ({
            cypher: `WITH $params as batch
        UNWIND batch as edge
        MATCH (sEnt: SKOS{id: edge.sourceId})
        MATCH (tEnt: SKOS{id: edge.targetId})
        MERGE (sEnt)-[e: ${relation}]->(tEnt)
        RETURN sEnt, tEnt, e
    `,
            params: edgeTypes[relation],
        }));
}

/**
 * Take a set of actions from the front end and map them to Neo4J queries
 * @param action
 * @param neo4JInterface
 * @returns {Promise<{error: null, value: Awaited<null|*>[]}|{error, value: null}>}
 */

const mapAction = ((a, obj = { nodes: [], edges: [] }) => {
    if (!a) return obj; // If there is no action specified return
    a.forEach((v) => {
        if (v.sourceId) obj.edges.push(v);
        if (v.type) obj.nodes.push(v);
    });
    return obj;
});

async function neo4jUpdate(action, neo4JInterface) {
    // Break the nodes and edges for each action into seperate arrays
    const deleteAction = mapAction(action.delete);
    const createAction = mapAction(action.create);
    const updateAction = mapAction(action.update, createAction);

    // Create the Neo4J queries for each set of actions
    const cypherDeleteEdges = deleteEdges(deleteAction.edges);
    const cypherDeleteNodes = deleteNodes(deleteAction.nodes);
    const cypherUpdateEdges = updateEdges(updateAction.edges);
    const cypherUpdateNodes = updateNodes(updateAction.nodes);

    try {
        const allActions = [
            ...neo4JInterface.writeBatch(cypherDeleteEdges),
            ...neo4JInterface.writeBatch(cypherDeleteNodes),
            ...neo4JInterface.writeBatch(cypherUpdateNodes),
        ].filter((q) => q); // Remove nulls
        const res = await Promise.all(allActions);
        // Edges must be done after nodes are confirmed, otherwise they may not get entered
        const edge = await Promise.all(neo4JInterface.writeBatch(cypherUpdateEdges));
        console.log(res);
        console.log(edge);
        return {
            error: null,
            value: res,
        };
    } catch (err) {
        console.log(err);
        return {
            error: err,
            value: null,
        };
    }
}

module.exports = {
    deleteNodes,
    deleteEdges,
    updateNodes,
    updateEdges,
    neo4jUpdate,
};
