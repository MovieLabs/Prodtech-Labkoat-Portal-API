import { transform } from 'omcUtil';

const {
    unEmbed,
    toObject,
} = transform;

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
    ProductionScene: (omc) => ({
        ...omc,
        // name: omc.sceneName ? `${omc.sceneName.fullName}` : null,
    }),
};

export default function yamduCleanup(omc) {
    const yamduData = unEmbed(omc); // unEmbed the OMC entities

    // Cleanup individual entity types
    const yamduClean = yamduData.map((ent) => {
        const { entityType } = ent;
        return (entityTransform[entityType]) ? entityTransform[entityType](ent) : ent;
    }).filter((ent) => ent !== null);

    const yamduObject = toObject(yamduClean); // Convert the entities back to an object
    console.log(yamduObject);
    return yamduObject;
}
