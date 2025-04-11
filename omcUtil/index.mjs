/**
 * A set of utilities useful when using OMC-JSON
 *
 * omcTransform - Methods for transforming or manipulating OMC-JSON
 * omcUtil - Methods for extracting information from OMC-JSON
 * omcValidate - Validate OMC-JSON against the schema
 *
 */

/**
 * @namespace omc
 */

/**
 * @memberof omc
 * @typedef {object} omcIdentifier
 * @property {string} identifierScope - The scope of the identifier
 * @property {string} identifierValue - The value of the identifier
 */

/**
 * @memberof omc
 * @typedef {string} entityType - A string that represents the type of entity this instance describes
 */

/**
 * @memberof omc
 * @typedef {object} omcEntity
 * @property {string} testSchemaVersion - The identifier for the OMC-JSON schema the entity was encoded with
 * @property {entityType} entityType - The type of entity this object describes
 * @property {omcIdentifier[]} identfier - An OMC identifier
 * @property {*} key - Parameters specific to the entity type
 */

/**
 * @memberof omc
 * @typedef {object} OMC-JSON-Object
 * @property {*} omcEntity[] - An OMC entity, where the key is it's entityType
 */

/**
 * @memberof omc
 * @typedef {OMC-JSON-Object | omcEntity[]} OMC-JSON
 */

import generateId from './src/omc/generateID.mjs';
import migrate from './src/omc/migrate.mjs';
import compare from './src/omc/compare.mjs';
import * as transform from './src/omc/transform.mjs';
import * as identifier from './src/omc/identifier.mjs';
import * as edges from './src/omc/edges.mjs';
import validate from './src/omc/validate.mjs';

export {
    // identifierOfScope,
    generateId,
    migrate,
    compare,
    transform,
    identifier,
    edges,
    validate,
};
