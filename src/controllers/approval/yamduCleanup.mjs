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
