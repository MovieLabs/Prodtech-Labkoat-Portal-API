/**
 * @module omc/context
 */

const baseKeys = [
    'identifier',
    'schemaVersion',
    'entityType',
    'contextType',
    'contextCategory',
    'name',
    'description',
    'For',
    'ForEntity',
    'Context'
];

export function related(ent){
    if (ent.entityType !== 'Context') return null;
    return Object.keys(ent).filter((k) => !baseKeys.includes(k));
}

export function intrinsic(ent) {
    return Object.keys(ent).filter((k) => k[0].toLowerCase() !== k[0]); // Intrinsic properties are upper case
}

const reverseMap = {
    'featuresIn': 'features',
    'features': 'featuresIn',
    'neededBy': 'needs',
    'needs': 'neededBy',
    'has': 'for',
    'for': 'has',
    'represents': 'representedBy',
    'representedBy': 'represents',
    'usedIn': 'uses',
    'uses': 'usedIn',
};

const reverseRelation = ((rel) => reverseMap[rel] ? reverseMap[rel] : rel);

export function inverse(context) {
    // Generate the relationships to the source entities in the ForEntity properties
    const sourceRelated = ((sourceEntity) => {
        return sourceEntity.reduce((obj, srcEnt) => {
            const { entityType, identifier } = srcEnt;// The type and identifier of the source entity
            obj[entityType] = [...obj[entityType] || [], { identifier }];
            return obj;
        }, {});
    });

    // Invert all the relations in the context, these are independently each a context (merge them later)
    const invert = ((cxt, sourceEntity) => {
        const relations = related(cxt); // The relations in the context
        if (!relations) return [] // If no relations, then nothing to do
        const res = [];
        relations.forEach((relation) => {
            const revRelation = reverseRelation(relation); // Reverse the relation
            const relEntities = Object.keys(cxt[relation]); // The related entities for this relation
            relEntities.forEach((key) => {
                res.push(cxt[relation][key].map((relEnt) => ({
                        entityType: 'Context',
                        ForEntity: {
                            identifier: relEnt.identifier,
                        },
                        [revRelation]: sourceRelated(sourceEntity),
                    })
                ));
            });
        });
        return res.flat();
    });

    const sourceEntity = context.ForEntity.filter((se) => {
        if (!Object.hasOwn(se, 'entityType')) {
            console.log('Error: omcUtil.context.inverse - Missing entityType in the ForEntity');
            return null;
        }
        return se // The inverse context for the source entity
    }).filter((d) => d);
    return sourceEntity.length ? invert(context, sourceEntity) : []; // Check that there were no errors
}
