import { transform } from 'omcUtil';

const { unEmbed, toObject } = transform;

const entityTransform = {
    Character: (omc) => ({
        ...omc,
        name: omc.characterName ? `${omc.characterName.fullName}` : null,
    }),
    NarrativeScene: (omc) => ({
        ...omc,
        name: omc.sceneName ? `${omc.sceneName.fullName}` : null,
    }),
    ProductionScene: (omc) => ({
        ...omc,
        name: omc.sceneName ? `${omc.sceneName.fullName}` : null,
    }),
};

export default function yamduCleanup(omc) {
    const yamduData = unEmbed(omc); // unEmbed the OMC entities

    // Cleanup individual entity types
    const yamduClean = yamduData.map((ent) => {
        const { entityType } = ent;
        return (entityTransform[entityType]) ? entityTransform[entityType](ent) : ent;
    });

    const yamduObject = toObject(yamduClean); // Convert the entities back to an object
    console.log(yamduObject);
    return yamduObject;
}
