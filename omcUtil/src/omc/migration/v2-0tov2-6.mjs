/**
 * Migrate and OMC entity from v2.0 to v2.6
 *
 * @module omc/migration/v2-0tov2-6
 * @type {omc}
 */
import { hasProp } from '../../util/util.mjs';

const schemaVersion = 'https://movielabs.com/omc/json/schema/v2.6';

export default {
    Asset: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    AssetSC: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Infrastructure: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    InfrastructureSC: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Character: ((omc) => {
        const updatedOmc = {
            ...omc,
            schemaVersion,
        };
        const background = omc?.profile?.background || null;
        if (background) {
            const updateBg = Object.keys(background).map((key) => ({
                author: null,
                title: key,
                text: background[key],
            }));
            updatedOmc.profile.background = updateBg;
        }
        return updatedOmc;
    }),
    Context: ((omc) => {
        const updatedOmc = {
            ...omc,
            schemaVersion,
        };
        if (hasProp(omc, 'needs') && omc.needs !== null && hasProp(omc.needs, 'NarrativeAction')) {
            updatedOmc.needs = { ...omc.needs };
            updatedOmc.needs.SpecialAction = omc.needs.NarrativeAction;
            delete updatedOmc.needs.NarrativeAction;
        }
        return updatedOmc;
    }),
    CreativeWork: (omc) => {
        const updatedOmc = {
            ...omc,
            schemaVersion,
        };
        const titleMap = { // Map the title types
            workingTitle: 'working',
            officialTitle: 'release',
            internalTitle: 'internal',
        };
        if (omc.title) {
            updatedOmc.creativeWorkTitle = Object.keys(omc.title)
                .map((key) => ({
                    titleName: omc.title[key] || null, // Map the title type
                    titleType: titleMap[key] || null,
                    titleLanguage: null,
                }));
        }
        delete updatedOmc.title; // Remove the old title
        return updatedOmc;
    },
    Depiction: ((omc) => {
        const updatedOmc = {
            ...omc,
            schemaVersion,
        };
        if (hasProp(omc, 'Depictor')) {
            updatedOmc.Depicter = omc.Depictor;
            delete updatedOmc.Depictor;
        }
        return updatedOmc;
    }),
    Effect: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    NarrativeAction: (omc) => ({
        ...omc,
        schemaVersion,
        entityType: 'SpecialAction',
    }),
    NarrativeAudio: ((omc) => {
        // Mapping of terms from v2.0 to v2.6
        const narAudio = {
            audio: 'narrativeAudio',
            soundEffect: 'narrativeSoundEffect',
            music: 'narrativeMusic',
        };
        const { narrativeType } = omc || 'audio';
        return {
            ...omc,
            schemaVersion,
            narrativeType: narAudio[narrativeType] || 'narrativeAudio',
        };
    }),
    NarrativeLocation: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    NarrativeObject: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    NarrativeScene: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    NarrativeStyling: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    NarrativeWardrobe: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    ProductionLocation: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    ProductionScene: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Sequence: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Slate: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    SpecialAction: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Participant: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Organization: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Department: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Person: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Service: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Role: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Task: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    TaskSC: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Location: (omc) => ({
        ...omc,
        schemaVersion,
    }),
};
