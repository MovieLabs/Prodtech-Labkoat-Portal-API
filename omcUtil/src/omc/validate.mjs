/**
 * Validate OMC JSON against the schema
 */

/**
 * @typedef {object} validationOptions
 * @property {boolean} atomic - The entire update must be valid or it will be fail
 * @property {string} schemaVersion - The schema version to validate against
 * @property {string} errorResponse - The type of response to return if there is an error
 */

import Ajv2019 from 'ajv/dist/2019.js';
import { hasProp } from '../util/util.mjs';

/* eslint-disable */
// import schemav20 from '../schema/OMC-JSON-v2.0.schema.json' assert { type: 'json' };
import schemav21 from '../schema/OMC-JSON-v2.1.schema.json' with { type: 'json' };
import schemav26 from '../schema/OMC-JSON-v2.6.schema.json' with { type: 'json' };
/* eslint-enable */

const schemaValidators = {
    'https://movielabs.com/omc/json/schema/v2.0': schemav21, // 2.1 is bug fix for 2.0
    'https://movielabs.com/omc/json/schema/v2.1': schemav21,
    'https://movielabs.com/omc/json/schema/v2.6': schemav26,
};

const schemaValidator = Object.keys(schemaValidators)
    .reduce((obj, versionName) => {
        const ajv = new Ajv2019({ allowUnionTypes: true, strict: 'log' })
            .addKeyword('$anchor')
            .addKeyword('controlledValues') // Annotation for controlled values
            .compile(schemaValidators[versionName]);
        return {
            ...obj,
            [versionName]: ajv,
        };
    }, {});

// Check all the entities in an OMC array are valid, or return false
function atomicResult(results) {
    let validationResults = Array.isArray(results)
        ? results.map((res) => res.valid)
        : Object.values(results).flat().map((res) => res.valid);
    return validationResults.every((b) => b);
}


function checkSingleEntity(entity, options) {
    const { schemaVersion } = options; // Has a specific schema version been specified?
    const testSchemaVersion = schemaVersion || entity.schemaVersion;

    // Ensure the schema version is supported
    if (!hasProp(schemaValidator, testSchemaVersion)) {
        return {
            valid: false,
            error: `Invalid schema version: ${testSchemaVersion}`,
            omcEntity: entity,
        };
    }

    // Validate the entity against the schema
    const valid = schemaValidator[testSchemaVersion](entity); // This entity has a valid schema version

    return {
        valid,
        error: valid ? null : schemaValidator[testSchemaVersion].errors,
        omcEntity: entity,
    };
}

/**
 * Given an array of OMC entities, validate each one against the schema
 *
 * @param {omcEntity[]} omc - A single OMC entity
 * @param {validationOptions} options - Additional options
 */

function checkOmcArray(omc, options) {
    const { schemaVersion } = options; // Has a specific schema version been specified?

    const validationResults = omc.map((entity) => {
        const testSchemaVersion = schemaVersion || entity.schemaVersion;

        // Ensure the schema version is supported
        if (!hasProp(schemaValidator, testSchemaVersion)) {
            return {
                valid: false,
                error: `Invalid schema version: ${testSchemaVersion}`,
                omcEntity: entity,
            };
        }

        // Validate the entity against the schema
        const valid = schemaValidator[testSchemaVersion]([entity]); // This entity has a valid schema version

        return {
            valid,
            error: valid ? null : schemaValidator[testSchemaVersion].errors,
            omcEntity: entity,
        };
    });
    return validationResults;
}

/**
 *
 * @param {OMC-JSON} omc - OMC in object format
 * @param {validationOptions} options - Additional options
 * @returns {{}}
 */

function checkOmcObject(omc, options) {
    const keys = Object.keys(omc);

    if (keys.find((k) => k === 'schemaVersion')) {
        return checkSingleEntity(omc, options);
    }

    return keys.reduce((obj, entityType) => {
        const entityTypeResults = checkOmcArray(omc[entityType], options); // For each entity type, validate the entities
        return {
            ...obj,
            [entityType]: entityTypeResults,
        };
    }, {});
}


/**
 * Validates OMC-JSON against the OMC schema
 *
 * @function validate
 * @param {OMC-JSON} omc - Valid JSON to be validated
 * @param {validationOptions} options - Additional options
 * @return { boolean } - True if valid OMC-JSON, false if not
 */

export default function validate(omc, options = {}) {
    const {
        atomic = true, // The entire update must be valid or it will be fail
        schemaVersion = null, // The schema version to validate against
        errorResponse = 'verbose', // The type of response to return if there is an error
    } = options;

    const testResult = Array.isArray(omc)
        ? checkOmcArray(omc, options)
        : checkOmcObject(omc, options);

    if (atomic) {
        return atomicResult(testResult);
    }
    return testResult;
}

