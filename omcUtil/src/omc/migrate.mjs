import v20 from './migration/v2-0tov2-6.mjs';
import v26 from './migration/v2-6tov2-x.mjs';

import { hasProp } from '../util/util.mjs';

const schemaMigration = {
    'https://movielabs.com/omc/json/schema/v2.0': v20,
    'https://movielabs.com/omc/json/schema/v2.1': v20,
    'https://movielabs.com/omc/json/schema/v2.6': v26, // Placeholder for future migration
};

const latestSchemaVersion = 'https://movielabs.com/omc/json/schema/v2.6';

// Migrate a single instance
function migrateInstance(omc, toSchemaVersion) {
    const {
        entityType,
        schemaVersion,
    } = omc;

    if (!entityType || !schemaVersion) return { ...omc }; // Cannot migrate without these

    const migrationPattern = schemaMigration[schemaVersion]; // Use pattern for current schema version

    if (!migrationPattern) {
        console.log(`No migration pattern found for schema version ${schemaVersion}`);
        return { ...omc };
    }

    if (toSchemaVersion === schemaVersion) return omc; // Already at the target schema version
    return migrationPattern[entityType](omc);
}

/*
 Recurse down a nested entity migrating all instances to the latest schema version
 */
function migrateNested(ent, toSchemaVersion) {
    if (!Array.isArray(ent) && (typeof ent !== 'object' || ent === null)) {
        return ent; // Down to a primitive, null or undefined, so we are at a leaf
    }
    const refEnt = migrateInstance(ent, toSchemaVersion); // Migrate the entity if there is a migration path

    // If this is an array, then we parse each element (used in Context)
    if (Array.isArray(refEnt)) return refEnt.map((e1) => migrateNested(e1));

    const refKeys = Object.keys(refEnt);
    refKeys.forEach((refKey) => {
        if (ent[refKey] !== null) {
            refEnt[refKey] = Array.isArray(refEnt[refKey])
                ? refEnt[refKey].flatMap((e1) => migrateNested(e1))
                : migrateNested(refEnt[refKey]);
        }
    });
    return refEnt;
}

// Migrate a set of entities
const migrateSet = ((omc, toSchemaVersion) => omc.map((ent) => migrateNested(ent, toSchemaVersion)));

/**
 * Migrate either an array of OMC entities a single OMC entity or an object of OMC entities
 *
 * @param omc {OMC-JSON} - The OMC entity or entities to migrate
 * @param toSchemaVersion {string} - Migrate upto this schema version
 * @returns {OMC-JSON}
 */

export default function migrate(omc, toSchemaVersion = latestSchemaVersion) {
    if (Array.isArray(omc)) return migrateSet(omc, toSchemaVersion); // Array of instances
    if (hasProp(omc, 'entityType')) return migrateNested(omc, toSchemaVersion); // Single instance
    return Object.keys(omc).reduce((obj, entKey) => (
        { ...obj, ...{ [entKey]: migrateSet(omc[entKey], toSchemaVersion) } }), {});
}
