/**
 * Fix errors in the Yamdu OMC
 * @param yamduOmc
 * @returns {*}
 */

import {
    transform as transformOmc,
    edges as omcEdges,
} from 'omcUtil';

// import { primaryScope, schemaVersion } from '../constants.mjs';
import { inverseRelationship } from './inverseRelationship.mjs';

export const schemaVersion = 'https://movielabs.com/omc/json/schema/v2.6';
export const primaryScope = 'com.yamdu.app';

// Replace or create the ForEntity property in the Context entity
function fixContext(yamduOmc, cxtValues = {}) {
    const { Context = [], identifier } = yamduOmc; // Context and the id for the parent entity
    return Context.map((cxt) => {
        const { For, ...clnCxt } = cxt;
        return {
            ...clnCxt,
            ForEntity: [{ identifier }],
            ...cxtValues,
        };
    });
}

// Fix the broken identifiers in the ProductionScene and Context entities
// Ensure name is set, using the sceneName.fullName
// Update the Context
function fixProductionScene(yamduOmc) {
    const {
        Context,
        identifier,
    } = yamduOmc;

    const {
        identifierScope,
        identifierValue,
    } = identifier[0];
    const updatedIdentifier = identifierValue.replace('scene', 'shot'); // Fix broken id in Yamdu
    const cxtIdentifier = Context[0].identifier[0].identifierValue;
    const updatedCxtIdentifier = cxtIdentifier.replace('scene', 'shot'); // Fix broken id in Yamdu
    return {
        ...yamduOmc,
        name: yamduOmc.sceneName ? `${yamduOmc.sceneName.fullName}` : null,
        identifier: [{
            identifierScope,
            identifierValue: updatedIdentifier,
        }],
        Context: [{
            ...Context[0],
            identifier: [{
                identifierScope,
                identifierValue: updatedCxtIdentifier,
            }],
            ForEntity: [{
                identifier: [{
                    identifierScope,
                    identifierValue: updatedIdentifier,
                }],
            }],
            name: 'ProductionScene.for.NarrativeScene',
            contextType: 'production',
            contextCategory: 'productionScene-narrativeScene',
        }],
    };
}

// Add the reference back to the Character in the Depiction entity, the Depicts property
// Copy the name from Character into the Depiction entity, so that Depiction has a name
// Remove the errant 'needs' property from the Context entity
function fixCharacter(yamduOmc) {
    const { Context } = yamduOmc;
    if (Context && Context[0].featuresIn?.needs) delete Context[0].featuresIn.needs;
    const { Depiction } = yamduOmc;
    if (!Depiction || !Depiction.length) return yamduOmc;
    const {
        identifier,
        name,
    } = yamduOmc;
    Depiction.forEach((ent) => {
        ent.name = name;
        ent.Depicts = { identifier };
    });
    return yamduOmc;
}

// Fix the broken identifiers in the NarrativeObject entities
function fixNarrativeObject(yamduOmc) {
    const { identifier } = yamduOmc;
    const {
        identifierScope,
        identifierValue,
    } = identifier[0];
    const updatedIdentifier = identifierValue.replace('script', 'scene'); // Fix broken id in Yamdu

    return {
        ...yamduOmc,
        identifier: [{
            identifierScope,
            identifierValue: updatedIdentifier,
        }],
    };
}

function fixProductionLocation(yamduOmc) {
    const { Location } = yamduOmc;
    const coordinates = Location.coordinates || null;
    if (coordinates) {
        coordinates.latitude = typeof coordinates?.latitude === 'string'
            ? Number(coordinates.latitude) : coordinates.latitude;
        coordinates.longitude = typeof coordinates?.longitude === 'string'
            ? Number(coordinates.longitude) : coordinates.longitude;
    }
    Location.name = yamduOmc.name;
    Location.description = yamduOmc.description;
    return yamduOmc;
}

// Methods for entities that need code modifications made to them
const entityFixers = {
    Character: fixCharacter,
    NarrativeObject: fixNarrativeObject,
    ProductionLocation: fixProductionLocation,
    ProductionScene: fixProductionScene,
};

// Values to use for the Context entities of each entity type, improves readability
const cxtValues = {
    Character: {
        contextType: 'narrative',
        contextCategory: 'character-narrativeScene',
        name: 'Character.featuresIn.NarrativeScene',
    },
    Effect: {
        contextType: 'narrative',
        contextCategory: 'effect-narrativeScene',
        name: 'Effect.featuresIn.NarrativeScene',
    },
    NarrativeObject: {
        contextType: 'narrative',
        contextCategory: 'narrativeObject-narrativeScene',
        name: 'NarrativeObject.featuresIn.NarrativeScene',
    },
    NarrativeLocation: {
        contextType: 'narrative',
        contextCategory: 'narrativeLocation-narrativeScene',
        name: 'NarrativeLocation.featuresIn.NarrativeScene',
    },
    NarrativeWardrobe: {
        contextType: 'narrative',
        contextCategory: 'narrativeWardrobe-narrativeEntities',
        name: 'NarrativeWardrobe to NarrativeEntities',
    },
    NarrativeScene: {
        contextType: 'narrative',
        contextCategory: 'narrativeScene-narrativeEntities',
        name: 'NarrativeScene.features.NarrativeEntities',
    },
    SpecialAction: {
        contextType: 'narrative',
        contextCategory: 'specialAction-narrativeScene',
        name: 'SpecialAction.featuresIn.NarrativeScene',
    },
    NarrativeAudio: {
        contextType: 'narrative',
        contextCategory: 'narrativeAudio-narrativeScene',
        name: 'NarrativeAudio.featuresIn.NarrativeScene',
    },
    ProductionLocation: {
        contextType: 'narrative',
        contextCategory: 'productionLocation-narrativeLocation',
        name: 'ProductionLocation.for.NarrativeLocation',
    },
};

// Inverse relationships for the Context entities that need the inverse relationship calculated
const cxtInverse = {
    Effect: {
        schemaVersion,
        entityType: 'Context',
        contextType: 'narrative',
        contextCategory: 'narrativeScene-effect',
        name: 'NarrativeScene.features.Effect (inverse)',
    },
    NarrativeAudio: {
        schemaVersion,
        entityType: 'Context',
        contextType: 'narrative',
        contextCategory: 'narrativeScene-narrativeAudio',
        name: 'NarrativeScene.features.NarrativeAudio (inverse)',
    },
    NarrativeWardrobe: {
        schemaVersion,
        entityType: 'Context',
        contextType: 'narrative',
        contextCategory: 'narrativeScene-narrativeWardrobe',
        name: 'NarrativeScene.features.NarrativeWardrobe',
    },
    ProductionLocation: {
        schemaVersion,
        entityType: 'Context',
        contextType: 'production',
        contextCategory: 'productionLocation-narrativeScene',
        name: 'ProductionLocation.featuresIn.NarrativeScene',
    },
    ProductionScene: {
        schemaVersion,
        entityType: 'Context',
        contextType: 'production',
        contextCategory: 'productionScene-narrativeScene',
        name: 'NarrativeScene.has.ProductionScene',
    },
    SpecialAction: {
        schemaVersion,
        entityType: 'Context',
        contextType: 'narrative',
        contextCategory: 'specialAction-narrativeScene',
        name: 'NarrativeScene.features.SpecialAction',
    },
};
export default function yamduCleanup(yamduOmc) {
    const updateOmc = yamduOmc.reduce((cln, ent) => {
        const { entityType } = ent;
        const cleanEnt = entityFixers[entityType] ? entityFixers[entityType](ent) : ent;
        const intrinsicEdges = [...omcEdges.intrinsic(ent), entityType]; // The entity types we want to return
        const cleanCxt = fixContext(cleanEnt, cxtValues[entityType]);
        const cleaned = transformOmc.toObject(transformOmc.unEmbed({
            ...cleanEnt,
            Context: cleanCxt,
        }));
        // Return the cleaned entity, and entities that are intrinsic to the entity
        intrinsicEdges.forEach((edge) => {
            cln[edge] = [...cln[edge] || [], ...cleaned[edge] || []];
        });
        return cln;
    }, {});

    // Add the inverse relationships to the Context entities
    const entityType = Object.keys(updateOmc).filter((e) => e !== 'Context');
    const invContext = entityType.flatMap((key) => (cxtInverse[key]
        ? inverseRelationship(updateOmc, primaryScope, cxtInverse[key])
        : []));
    updateOmc.Context = [...updateOmc.Context, ...invContext]; // These are the cleaned and inverse Context entities

    return updateOmc;
}
