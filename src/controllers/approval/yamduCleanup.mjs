import * as crypto from 'node:crypto';
import { transform } from 'omcUtil';

import { fMamFetch } from '../fMamFetch.mjs';

const {
    unEmbed,
    toObject,
} = transform;

// ProductionScene / Slate mapping
const prodSceneToSlate = {
    '1-A': ['1A'], // Yvette's hand reaching for bottle
    '1-B': ['1B'], // Yvette meditates, Augustus pulls her down
    '1-C': ['1C'], // Yvette meditates, close up of ear and ear cuff
    '1-D': ['1D'], // Augustus lands Yvette and triggers ships countdown, with Yvette's help
    '1-E': ['1E'], // Augustus speaks with Yvette after landing her.
    '1-F': ['1F'], // Augustus speaks with Yvette after landing her.
    '1-G': ['1G'], // Silhouette of Yvette and Augustus in Porthole
    '1-H': ['1H'], //
    '1-J': ['1J'],
    '1-K': ['1K'],
    '1-L': ['1L'],
    '1-M': ['1M'],
    '1-N': ['1N'],
    '1-P': ['1P'],
    '1-Q': ['1Q'],

    '2-A': ['2A'], // Yvette blue ocean iris and push to the back of her eye
    '3-A': ['3A'], // Jupiter and Europa, small in the sky, small ship moving toward Europa

    '4-A': ['4A'], // Push in on shuttle portal through to stars outside
    '4-B': ['4B'], // Yvette shakes in her seat as ship lands
    '4-C': ['4C'], // Yvette hears the ocean and slowly turns head
    '4-D': ['4D'], // Astronauts shake in seats as ship lands
    '4-E': ['4E'], // Astronauts shake in seats as ship lands
    '4-F': ['4F'], // Astronauts shake in seats as ship lands
    '4-G': ['4G'], // Astronauts shake in seats as ship lands
    '4-H': ['4H'], // Astronauts shake in seats as ship lands
    '4-J': ['4J'], // Yvette looks down at iPad and notices water whirring
    '4-K': ['4K'], // Yvette using her watch
    '4-L': ['4L'], // Water whirring, close up - VFX

    '5-A': ['5A'], // Astronauts look through porthole of shuttle
    '5-B': ['5B'], // Astronauts look through porthole of shuttle
    '5-C': ['5C', '5C_TEST'], // Exit hatch door slides open 60fps
    '5-D': ['5D'], // Exit hatch door slides open 24fps

    '6-A': ['6A'], // Boot landing, Jessica then Augustus
    '6-B': ['6B'], // Standing in line, looking up at Jupiter's views
    '6-C': ['6C'], // Standing in line, looking up at Jupiter's views
    '6-D': ['6D'], // Master coverage of landing through flag placement
    '6-E': ['6E'], // Master coverage of landing through flag placement
    '6-F': ['6F'], // Boot landing, Jessica then Augustus
    '6-G': ['6G'], // Master coverage of landing through flag placement
    '6-H': ['6H'], // God amongst men, Yvette and Jessica climbing down ladder
    '6-J': ['6J'], // God amongst men, Yvette and Jessica climbing down ladder
    '6-K': ['6K'], // Jupiter majestically glows behind helmets
    '6-L': ['6L', '6L_REH'], // Yvette boot reveal, showing footprint.
    '6-M': ['6M'], // Claustrophobic shot on face looking into their helmet
    '6-P': ['6P'], // Descending ladder
    '6-Q': ['6Q'], // Metal latch
};

const hashString = (idString) => {
    return crypto.createHash('md5')
        .update(idString)
        .digest('hex');
};

const entityTransform = {
    Character: (omc) => ({
        ...omc,
        name: omc.characterName ? `${omc.characterName.fullName}` : null,
    }),
    NarrativeScene: ((omc) => {
        return omc.sceneNumber === omc.sceneName?.fullName
            ? {
                ...omc,
                name: omc.sceneNumber ? `${omc.sceneNumber}` : null,
            }
            : null;
    }),
    Location: (omc) => {
        const coordinates = omc.coordinates || null;
        if (coordinates) {
            coordinates.latitude = typeof coordinates?.latitude === 'string'
                ? Number(coordinates.latitude) : coordinates.latitude;
            coordinates.longitude = typeof coordinates?.longitude === 'string'
                ? Number(coordinates.longitude) : coordinates.longitude;
        }
        return {
            ...omc,
            name: omc?.address.street ? `${omc.address.street}` : null,
            coordinates,
        };
    },
};

function matchSlates({
    Slate,
    ProductionScene,
    Context,
}) {
    const slateMap = Slate.reduce((obj, ent) => {
        const psNumber = (ent.slateUID.split('-'))[0];
        obj[psNumber] = obj[psNumber]
            ? [...obj[psNumber], { identifier: ent.identifier }]
            : [{ identifier: ent.identifier }];
        return obj;
    }, {});

    const cxt = [];
    ProductionScene.forEach((ent) => {
        const psNumber = ent.name;
        if (!prodSceneToSlate[psNumber]) return; // Don't bother is we don't have a mapping
        const slates = prodSceneToSlate[psNumber].flatMap((sltId) => slateMap[sltId] || []);
        if (slates.length === 0) { // Catch errors where we don't have any slates
            console.log('No slates found for ProductionScene', psNumber);
            return; // Don't bother if we don't have any slates
        }
        prodSceneToSlate[psNumber].forEach((sltId) => delete slateMap[sltId]); // Remove, so we know what's left at the end

        // Create an identifier for the ProductionScene Context
        const cxtId = hashString(`ProductionScene-${psNumber}`);
        const cxtIdentifier = {
            identifierScope: 'movielabs.com/omc/yamdu',
            identifierValue: `cxt-${cxtId}`,
        };

        // Create the Context relating a ProductionScene to it's Slates
        cxt.push({
            schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
            entityType: 'Context',
            identifier: [cxtIdentifier],
            name: 'productionScene-slate',
            description: `Slates for Production Scene ${ent.name}`,
            contextType: 'production',
            contextCategory: 'productionScene-slate',
            has: {
                Slate: slates,
            },
        });
        ent.Context.push({ identifier: [cxtIdentifier] }); // Add the Context to the ProductionScene
    });
    console.log(cxt);
    console.log(slateMap);
    return {
        ProductionScene,
        Context: [...Context, ...cxt],
    };
}

// Fix up broken ProductionScene entities, this is a temporary fix
async function fixProductionScene(yamduResponse, next) {
    const ProductionScene = yamduResponse.ProductionScene.map((ent) => {
        const {
            Context,
            identifier,
        } = ent;
        const {
            identifierScope,
            identifierValue,
        } = identifier[0];
        const updatedIdentifier = identifierValue.replace('scene', 'shot'); // Fix broken id in Yamdu
        const cxtIdentifier = Context[0].identifier[0].identifierValue;
        const updatedCxtIdentifier = cxtIdentifier.replace('scene', 'shot'); // Fix broken id in Yamdu
        return {
            ...ent,
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
            }],
        };
    });
    const Context = yamduResponse.Context.map((ent) => {
        const { identifier } = ent;
        const {
            identifierScope,
            identifierValue,
        } = identifier[0];
        const updatedIdentifier = identifierValue.replace('scene', 'shot'); // Fix broken id in Yamdu
        return {
            ...ent,
            identifier: [{
                identifierScope,
                identifierValue: updatedIdentifier,
            }],
            name: 'productionScene-narrativeScene',
            contextType: 'production',
            contextCategory: 'productionScene-narrativeScene',
        };
    });

    const entityType = 'Slate';
    const fMamProject = 'yamdu';
    const fRes = await fMamFetch({
        next,
        method: 'GET',
        route: `entityType/${entityType}`,
        query: {
            project: fMamProject,
        },
    });
    console.log(fRes);
    if (fRes.status === 200) {
        return matchSlates({
            Slate: fRes.payload,
            ProductionScene,
            Context,
        });
    }
    return {
        ProductionScene,
        Context,
    };
}

export default async function yamduCleanup(omc, next) {
    const yamduData = unEmbed(omc); // unEmbed the OMC entities

    // Cleanup individual entity types
    const yamduClean = yamduData.map((ent) => {
        const { entityType } = ent;
        return (entityTransform[entityType]) ? entityTransform[entityType](ent) : ent;
    })
        .filter((ent) => ent !== null);

    let yamduObject = toObject(yamduClean); // Convert the entities back to an object

    // Special case scenario for ProductionScene
    if (yamduObject.ProductionScene) {
        yamduObject = await fixProductionScene(yamduObject, next);
    }

    console.log(yamduObject);
    return yamduObject;
}
