/**
 * Migrate and OMC entity from v2.0 to v2.5
 *
 * @module omc/migration/v2-6tov2-x
 * @type {omc}
 */

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
    Character: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Context: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    CreativeWork: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Depiction: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    Effect: (omc) => ({
        ...omc,
        schemaVersion,
    }),
    NarrativeAction: (omc) => ({
        ...omc,
        schemaVersion,
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
    Composition: (omc) => ({
        ...omc,
        schemaVersion,
    }),
};
