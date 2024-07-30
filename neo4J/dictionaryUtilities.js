/**
 *
 * @param val
 * @returns {*|*[]}
 */
const makeArray = (val) => (Array.isArray(val) ? val : [val]);

/**
 * Return the properties for this node
 * @param nId {string} - The identifier of thw requested node
 * @returns {{} | null} - The properties of the requested node
 */
function getNode(nId) {
    return this.nodes[nId] || null;
}

/**
 * The identifiers of all nodes of type 'entity'
 * @param type {string | string[]} - A single, or array of omc types
 * @returns {string[]} - The identifiers for all nodes of the requested types
 */
function getType(type) {
    const types = makeArray(type);
    return Object.keys(this.nodes)
        .filter((nId) => types.includes(this.nodes[nId].type));
}

/**
 * Return id's for any node related to this node with the relation name
 * @param nId {string} - The identifier of thw requested node
 * @param relation {string | string[]} - A single relationship name or an array of relationship names
 * @returns {string[]} - The identifiers of nodes that are related using the requested relationship names
 */
function getRelated(nId, relation) {
    const relations = makeArray(relation);
    if (!this.edges[nId]) return []; // For nodes that do not have edges
    return this.edges[nId].filter((e) => relations.includes(e.relation))
        .map((n) => n.targetId);
}

/**
 * Make updates to the Neo4J database then internal cache
 * @param action
 */

function cacheUpdate(action) {
    if (action.create) {
        action.create.forEach((c) => {
            if (c.sourceId) {
                const { sourceId } = c;
                this.edges[sourceId] = this.edges[sourceId] ? [...this.edges[sourceId], c] : [c];
                console.log(this.edges[sourceId]);
                console.log();
            } else {
                const { id } = c;
                this.nodes[id] = c;
                this.edges[id] = [];
            }
        });
    }
    if (action.update) {
        action.update.forEach((c) => {
            if (c.sourceId) {
                const { sourceId } = c;
                this.edges[sourceId] = this.edges[sourceId] ? [...this.edges[sourceId], c] : [c];
                console.log(this.edges[sourceId]);
                console.log();
            } else {
                const { id } = c;
                Object.keys(c)
                    .forEach((k) => {
                        this.nodes[id][k] = c[k];
                    });
            }
        });
    }
    if (action.delete) {
        action.delete.forEach((d) => {
            if (d.sourceId) {
                const { sourceId } = d;
                const keepEdges = this.edges[sourceId].filter((e) => {
                    return !(e.targetId === d.targetId && e.relation === d.relation);
                });
                this.edges[sourceId] = keepEdges;
            } else {
                const { id } = d;
                delete this.nodes[id];
                delete this.edges[id];
                // Object.keys(this.edges)
                //     .forEach((sourceId) => {
                //         const keepEdges = this.edges[sourceId].filter((e) => !(e.targetId !== id));
                //         this.edges[sourceId] = keepEdges;
                //     });
            }
        });
    }
}

module.exports = {
    getNode,
    getRelated,
    getType,
    cacheUpdate,
};