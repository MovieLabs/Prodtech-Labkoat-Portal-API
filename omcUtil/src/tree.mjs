
import { identifierOfScope } from './omcUtil.mjs';
import { hasProp } from './util/util.mjs';

const removeKeys = ['Context', 'For', 'name', 'description', 'schemaVersion', 'identifier', 'entityType', 'contextType'];

export default function omcTree(omc, identifierScope) {

    // Receive and entity and extract relvent attributes
    const parseEntity = ((ent, identifierScope) => {
        const identifier = identifierOfScope(ent.identifier, identifierScope);
        const name = ent.name ? ent.name : identifier
        return {
            name: ent.entityType ? ent.entityType : 'Unknown',
            identifier,
            properties: {
                name,
                identifier
            }
        }
    });

    function traverseTree(omc, identifierScope) {
        if(omc == null) return null
        const node = parseEntity(omc, identifierScope);
        console.log(node.name);
        if (hasProp(omc, 'Context')) {
            node.edge = 'Context'; // This has a Context node
            node.children = omc.Context.map((cxt) => {
                const relations = Object.keys(cxt).filter((k) => !removeKeys.includes(k))
                    .filter((k) => cxt[k] !== null);
                if (relations.length === 0) return null // Empty Contexts
                const children = relations.flatMap((edge) => {
                    const entKeys = Object.keys(cxt[edge]).filter((ek) => cxt[edge][ek] !== null);
                    const trgt = entKeys.flatMap((entType) => cxt[edge][entType].map((e) => {
                        const cxtNode = traverseTree(e, identifierScope)
                        return cxtNode !== null ?
                            { ...cxtNode, ...{ edge, entityType: entType } }
                            : null
                    }))
                    return trgt.filter((t) => t !== null);
                })
                const node = parseEntity(cxt, identifierScope)
                return { ...node, ...{ children } }
            }).filter((n) => n !== null);
        }
        return node;
    }

    const children = omc.map((b) => {
        const t = traverseTree(b, identifierScope)
        return t
    });
    const root = {
        name: 'root',
        children
    }
    return root
}
