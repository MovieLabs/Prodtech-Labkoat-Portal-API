/**
 Create the query patterns for update the Neo4J database
 * */

const skosToLabel = {
    'skos:Concept': 'Concept',
    'skos:ConceptScheme': 'ConceptScheme',
    'skosxl:Label': 'Label',
    'omc:Class': 'Class',
    'omc:Property': 'Property',
    'omc:Entity': 'Entity',
    'omc:ControlledValue': 'ControlledValue',
    'omc:Schema': 'Schema',
};

const baseTypeMap = {
    omc: 'OMC',
    skos: 'SKOS',
    skosxl: 'SKOS',
};

const getBaseType = ((type) => {
    const baseType = type.split(':')[0]; // Grab left of the colon separator
    return baseTypeMap[baseType] ? baseTypeMap[baseType] : baseType; // Correct if necessary
});

// Which base types are the relationships between,
const edgeBaseTypes = ((e, baseType) => {
    if (e.length === 0) return ([baseType, baseType]); // Empty array, just return
    const edge = e[0]; // Use the first relation, the others are presumed to have the sane source and target type
    const sourceBase = edge.sourceType ? getBaseType(edge.sourceType) : baseType;
    const targetBase = edge.targetType ? getBaseType(edge.targetType) : baseType;
    return [sourceBase, targetBase];
});

function updateNodes(omcVocab, baseType) {
    const nodeTypes = omcVocab.reduce((obj, v) => {
        const entityType = skosToLabel[v.type] || getBaseType(v.type); // If entityType is unknown, use base type
        return { ...obj, ...{ [entityType]: obj[entityType] ? [...obj[entityType], v] : [v] } };
    }, {});

    return Object.keys(nodeTypes)
        .map((entityType) => {
            const props = new Set(); // Extract the props this entity uses
            nodeTypes[entityType].forEach((e) => {
                Object.keys(e)
                    .forEach((f) => props.add(f));
            }); // All params for the entityType
            let cypherProps = ''; // Construct the appropriate cypher to set the props
            props.forEach((p) => {
                cypherProps += `SET n.${p} = node.${p}\n`;
            });

            return {
                cypher: `WITH $params as batch
                UNWIND batch as node
                MERGE (n: ${baseType}{id:node.id})
                SET n: ${entityType}
                ${cypherProps}
                RETURN n
            `,
                params: nodeTypes[entityType],
            };
        });
}

function deleteNodes(omcVocab, baseType) {
    return [{
        cypher: `WITH $params as batch
        UNWIND batch as node
        MATCH (sEnt: ${baseType}{id: node.id})
        DETACH DELETE sEnt
        RETURN sEnt
    `,
        params: omcVocab,
    }];
}

// Batch the edges so that each edge type must be batched up together, edge names can not be a parameter
const batchEdges = ((omcVocab) => omcVocab.reduce((obj, params) => {
    const { relation } = params;
    return { ...obj, ...{ [relation]: obj[relation] ? [...obj[relation], params] : [params] } };
}, {}));

function deleteEdges(omcVocab, baseType) {
    const edgeTypes = batchEdges(omcVocab);
    return Object.keys(edgeTypes)
        .map((relation) => {
            const [sourceBase, targetBase] = edgeBaseTypes(edgeTypes[relation], baseType);
            return {
                cypher: `WITH $params as batch
        UNWIND batch as edge
        MATCH (sEnt: ${sourceBase}{id: edge.sourceId})-[e: ${relation}]->(tEnt: ${targetBase}{id: edge.targetId})
        DELETE e
        RETURN e
    `,
                params: edgeTypes[relation],
            };
        });
}

function updateEdges(omcVocab, baseType) {
    const edgeTypes = batchEdges(omcVocab);
    return Object.keys(edgeTypes)
        .map((relation) => {
            const [sourceBase, targetBase] = edgeBaseTypes(edgeTypes[relation], baseType);
            return {
                cypher: `WITH $params as batch
        UNWIND batch as edge
        MATCH (sEnt: ${sourceBase}{id: edge.sourceId})
        MATCH (tEnt: ${targetBase}{id: edge.targetId})
        MERGE (sEnt)-[e: ${relation}]->(tEnt)
        RETURN sEnt, tEnt, e
    `,
                params: edgeTypes[relation],
            };
        });
}

/**
 * Take a set of actions from the front end and map them to Neo4J queries
 * @param action
 * @param neo4JInterface
 * @returns {Promise<{error: null, value: Awaited<null|*>[]}|{error, value: null}>}
 */

const mapAction = ((a, obj = {
    nodes: [],
    edges: [],
}) => {
    if (!a) return obj; // If there is no action specified return
    a.forEach((v) => {
        if (!v) return; // Safety check for bad data
        if (v.sourceId) obj.edges.push(v);
        if (v.type) obj.nodes.push(v);
    });
    return obj;
});

async function neo4jUpdate(action, neo4JInterface, baseType = 'SKOS') {
    // Break the nodes and edges for each action into separate arrays
    const deleteAction = mapAction(action.delete);
    const createAction = mapAction(action.create);
    const updateAction = mapAction(action.update, createAction);

    // Create the Neo4J queries for each set of actions
    const cypherDeleteEdges = deleteEdges(deleteAction.edges, baseType);
    const cypherDeleteNodes = deleteNodes(deleteAction.nodes, baseType);
    const cypherUpdateEdges = updateEdges(updateAction.edges, baseType);
    const cypherUpdateNodes = updateNodes(updateAction.nodes, baseType);

    try {
        const allActions = [
            ...neo4JInterface.writeBatch(cypherDeleteEdges),
            ...neo4JInterface.writeBatch(cypherDeleteNodes),
            ...neo4JInterface.writeBatch(cypherUpdateNodes),
        ].filter((q) => q); // Remove nulls
        const nodes = await Promise.all(allActions);
        // Edges must be done after nodes are confirmed, otherwise they may not get entered
        const edges = await Promise.all(neo4JInterface.writeBatch(cypherUpdateEdges));
        console.log('Response for Nodes');
        console.log(nodes);
        console.log('Response for Edges');
        console.log(edges);
        return {
            error: null,
            result: { nodes, edges },
        };
    } catch (err) {
        console.log(err);
        return {
            error: err,
            result: null,
        };
    }
}

module.exports = {
    neo4jUpdate,
};
