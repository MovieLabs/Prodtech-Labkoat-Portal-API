/**
 * Create Contexts for the CreativeWork entity
 */

import { identifier as omcIdentifier } from 'omcUtil';

export const cwnsContext = {
    schemaVersion: 'https://movielabs.com/omc/json/schema/v2.6',
    entityType: 'Context',
    identifier: [
        {
            identifierScope: 'com.yamdu.app',
            identifierValue: 'com.yamdu.app.creativeWork.context.119374',
        },
        {
            identifierScope: 'movielabs.com/omc/europa',
            identifierValue: 'cxt-93mGPOi2YCQj7zO',
        },
    ],
    contextType: 'narrative',
    name: 'CreativeWork-NarrativeScene',
    description: 'Narrative scenes for the CreativeWork',
    ForEntity: [
        {
            identifier: [
                {
                    identifierScope: 'com.yamdu.app',
                    identifierValue: 'com.yamdu.app.project.119374',
                },
                {
                    identifierScope: 'movielabs.com/omc/europa',
                    identifierValue: '0g1Qk5LGgZa90UZ',
                },
            ],
        },
    ],
};

export function creativeWork(yamduOmc) {
    // Sorts the narrative scenes by the scene number, based on number and then alpha numerically
    const narScnRef = yamduOmc.NarrativeScene.sort((a, b) => {
        const digitsA = a.sceneNumber.replace(/\D/g, '');
        const digitsB = b.sceneNumber.replace(/\D/g, '');
        return (digitsA === digitsB) ? a.sceneNumber.localeCompare(b.sceneNumber) : digitsA - digitsB;
    })
        .map((ent) => ({ identifier: ent.identifier }));
    const cwCxt = omcIdentifier.find(yamduOmc.Context, cwnsContext.identifier);
    cwCxt.has = { NarrativeScene: narScnRef };
    console.log('Creative Work Context');
    console.log(cwCxt);
}
