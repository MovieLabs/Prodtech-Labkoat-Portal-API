import * as crypto from 'node:crypto';
import {
    edges as omcEdges,
    identifier as omcIdentifier,
    transform as omcTransform,
} from 'omcUtil';

const hashString = (idString) => {
    return crypto.createHash('md5')
        .update(idString)
        .digest('hex');
};

// Given an array of omc entities, return the entity matching the identifier
const findByIdentifier = (omc, identifier) => {
    if (!identifier) return null;
    return omc.filter((ent) => {
        try {
            return ent.identifier.find((id) => (
                (id.identifierValue === identifier.identifierValue) && (id.identifierScope === identifier.identifierScope)
            ));
        } catch (e) {
            console.log(ent);
        }
    });
};

/**
 * Merges a set of Context entities into a single entity where they share a parent in the ForEntity array
 * @param cxt
 * @param primaryScope
 * @param baseContext
 * @returns {*[]}
 */

function merge2(cxt, primaryScope, baseContext) {
    // Create a map of all the contexts for the same entity
    // ToDo: This would be better if if did not rely on using the primaryScope
    const mergeMap = cxt.reduce((obj, ent) => {
        const scopeId = omcIdentifier.ofScope(ent.ForEntity.identifier, primaryScope);
        const key = omcIdentifier.key(scopeId); // Create a key for the map from scope and value
        const t = obj[key] ? [...obj[key], ent] : [ent];
        return { ...obj, ...{ [key]: t } };
    }, {});

    const mergedCxt = Object.keys(mergeMap)
        .map((key) => {
            const context = {
                ...baseContext,
                identifier: [],
                entityType: 'Context',
                ForEntity: [mergeMap[key][0].ForEntity],
            };

            return mergeMap[key].reduce((obj, ent) => {
                const relations = omcEdges.related(ent); // The relations in this Context
                relations.forEach((rel) => {
                    obj[rel] = obj[rel] || {};
                    Object.keys(ent[rel])
                        .forEach((eKey) => {
                            obj[rel][eKey] = omcTransform.deDuplicate([...obj[rel][eKey] || [], ...ent[rel][eKey]]);
                        });
                });
                return obj;
            }, context);
        });
    return mergedCxt;
}

/**
 * Generate the inverse relationships for a set of entities and their Contexts
 * @param omc
 * @param primaryScope
 * @param baseContext {object} - The base Context to be used for the inverse relationship (default properties
 * @returns {*[]}
 */

export function inverseRelationship(omc, primaryScope, baseContext = {}) {
    const objObj = omcTransform.toObject(omcTransform.unEmbed(omc));
    const {
        Context,
        ...omcEntities
    } = objObj;

    // Using the utility functions to get the inverse relationships
    const allInverse = Object.keys(omcEntities || {})
        .flatMap((key) => {
            return omcEntities[key].flatMap((ent) => {
                if (!ent.Context || !ent.Context.length) return []; // If no Context
                const cxt = findByIdentifier(Context, ent.Context[0].identifier[0]);
                return omcEdges.inverse({
                    ...cxt[0],
                    ForEntity: [
                        {
                            entityType: ent.entityType,
                            identifier: ent.identifier,
                        },
                    ],
                });
            });
        });

    const merged = merge2(allInverse.flat(1), primaryScope, baseContext);
    // Generate an identifier (uses contents for consistency)
    merged.forEach((ent) => {
        const relations = omcEdges.related(ent);
        const cxtFor = ent.ForEntity.map((id) => JSON.stringify(id));
        const cxtEssence = relations.map((rel) => JSON.stringify(ent[rel]));
        const combinedIdentifiers = `${cxtFor.join(')')}${cxtEssence.join('')}`;
        const identifierValue = hashString(combinedIdentifiers); // Create a unique identifier for the context
        ent.identifier.push({
            identifierScope: primaryScope,
            identifierValue,
        });
    });
    return merged;
}

/**
 * If a Context has been created the reference will be added to the appropriate entities,
 * based on the values in the Contexts ForEntity array.
 * @param omc{Array} - The OMC-JSON array
 * @param omcEdges{Array} - The OMC-JSON array of Context entities to be added to appropriate entities
 * @param primaryScope{string} - The primary scope used to identify the Context
 */

// Do two identifiers match?
const identifierMatch = ((id1, id2) => (
    id1.identifierValue === id2.identifierValue) && (id1.identifierScope === id2.identifierScope));

const contextMatch = ((identifier1, identifier2) => identifier1.find((id1) => (
    id1.identifier.find((id) => identifier2.find((id2) => identifierMatch(id, id2))))));

export function addContext(omc) {
    const omcContext = omc.filter((ent) => ent.entityType === 'Context');
    omcContext.forEach((cxt) => {
        const forId = cxt.ForEntity.flatMap((ref) => ref.identifier); // Context could be for multiple entities
        const target = forId.flatMap((id) => omcIdentifier.find(omc, id))
            .filter((ent) => ent); // Find each entity for which this context applies (filter out nulls)
        target.forEach((ent) => {
            const exists = ent.Context ? contextMatch(ent.Context, cxt.identifier) : false; // Check if this entity already has a reference to the context
            if (exists) return; // If the context already exists, skip
            ent.Context = [...ent.Context || [], { identifier: cxt.identifier }]; // Add the missing Context reference to the entity
        });
    });
}
