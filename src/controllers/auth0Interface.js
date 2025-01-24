/**
 * Interface with Auth0FGA backend and operate on the users
 */

const { Auth0FgaApi } = require('@auth0/fga');

const { omcToAuth0User, omcToAuth0Organization } = require('./directory/auth0/auth0-omc-mapper');
const { makeArray } = require('../helpers/util');
const config = require('../../config');

let modelId = null;
let fgaClient = null;

/**
 * Set up a client for accessing the auth0fga instance, called after secrets are loaded
 * @param secrets {object}
 * @return {Promise<void>}
 */

async function fgaSetup(secrets) {
    const { LABKOAT } = secrets;
    fgaClient = new Auth0FgaApi({
        environment: config.LABKOAT_FGA_ENVIRONMENT,
        storeId: config.LABKOAT_FGA_STORE_ID,
        clientId: config.LABKOAT_FGA_CLIENT_ID,
        clientSecret: LABKOAT.LABKOAT_FGA_CLIENT_SECRET,
    });
    const response = await fgaClient.readAuthorizationModels();
    modelId = response.authorization_models[0].id;
    console.log(`Auth0fga model id: ${modelId}`);
}

/**
 * Delete a policy tuple or set of tuples
 * @param t
 * @return {Promise<string|any>}
 */
async function deleteTuple(t) {
    if (typeof t === 'undefined' || t.length === 0) return 'No/op'; // Avoid error when no policy updates
    const tuples = makeArray(t);

    while (tuples.length > 0) {
        const writeSet = tuples.splice(0, 1);
        const printable = `user: ${writeSet[0].user} / relation:${writeSet[0].relation} / object:${writeSet[0].object}`;
        try {
            await fgaClient.write({
                deletes: {
                    tuple_keys: writeSet,
                },
            });
            console.log(`Deleted: ${printable}`);
        } catch (err) {
            console.log(`Error: ${printable}`);
        }
    }
    return 'Success';
}

async function writeTuple(t) {
    if (!t || t.length === 0) return 'No/op'; // Avoid error when no policy updates

    const tuples = makeArray(t);
    while (tuples.length > 0) {
        const writeSet = tuples.splice(0, 1);
        const printable = `user: ${writeSet[0].user} / relation:${writeSet[0].relation} / object:${writeSet[0].object}`;
        try {
            const res = await fgaClient.write({
                writes: {
                    tuple_keys: writeSet,
                },
            });
            console.log(`Written: ${printable}`);
        } catch (err) {
            console.log(`Error: ${printable}`);
            // console.log(err);
        }
    }
    return 'Success';
}

async function check(tuple) {
    const { allowed } = await fgaClient.check({
        authorization_model_id: modelId,
        tuple_key: tuple,
    });
    console.log(`FGA Authorization: ${allowed ? 'Allowed' : 'Denied'}`);
    return allowed;
}

/**
 * Checks if this user has administrator privileges
 * @param user
 * @return {Promise<true | false>}
 */
async function isAdministrator(user) {
    return check({
        user: `user:${user}`,
        relation: 'hasRole',
        object: 'role:admin',
    });
}

/**
 * Check an OMC Participant against the Okta directory and update or add any differences
 * @param omcParticipant
 * @return {Promise<void>}
 */

async function auth0Participant(omcParticipant) {
    const userTuple = await omcToAuth0User(omcParticipant); // Convert a single user
    const orgTuple = await omcToAuth0Organization(omcParticipant);
    await writeTuple(userTuple);
    await writeTuple(orgTuple);
}

module.exports = {
    fgaSetup,
    writeTuple,
    deleteTuple,
    auth0Participant,
    check,
    isAdministrator,
};
