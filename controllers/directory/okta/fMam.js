/**
 * Interface to the fMam primarily for updating the Participants
 */

const fetch = require('node-fetch');

const btoa = require('btoa');
const request = require('request-promise');
const { makeArray, hasProp } = require('../../../helpers/util');

const config = require('../../../config');
const allCharactersQuery = require('../query/allCharacters');
const allStoryboardsQuery = require('../query/allStoryboards');
const allParticipantsQuery = require('../query/allParticipants');
const mutatePersonQuery = require('../query/mutationPerson');

const queryOptions = {
    allCharacters: allCharactersQuery,
    allStoryboards: allStoryboardsQuery,
    allParticipants: allParticipantsQuery,
    mutatePerson: mutatePersonQuery,
};

const fMamUrl = config.FMAM_URL; // Base Url for the fMam

const {
    LABKOAT_ISSUER,
    LABKOAT_DEFAULT_SCOPE,
    LABKOAT_CLIENT_ID,
} = config;

// Secrets are obtained from AWS secrets manager asynchronously
let awsSecrets = null;
let fMamBearerToken = null;
async function fMamSetup(secrets) {
    awsSecrets = secrets.FMAM;
}

async function fMamToken() {
    if (fMamBearerToken !== null) {
        console.log('Check the token expiration');
        const base64Url = fMamBearerToken.split('.')[1];
        const buff = Buffer.from(base64Url, 'base64');
        const claims = JSON.parse(buff.toString('ascii'));
        const dateNow = new Date();
        if (claims.exp > dateNow.getTime() / 1000) return fMamBearerToken;
    }

    const issuer = LABKOAT_ISSUER; // The URL for the Authorization server that is issuing the token
    const scope = LABKOAT_DEFAULT_SCOPE; // The scopes being requested
    const clientId = LABKOAT_CLIENT_ID;
    const clientSecret = awsSecrets.LABKOAT_CLIENT_SECRET;

    const token = btoa(`${clientId}:${clientSecret}`); // Base 64 encode
    try {
        const grant = await request({
            uri: `${issuer}/v1/token`, // Full path to request a token
            json: true,
            method: 'POST',
            headers: {
                authorization: `Basic ${token}`,
            },
            form: {
                grant_type: 'client_credentials',
                scope,
            },
        });
        fMamBearerToken = grant.access_token; // Retrieve the token and its type from the response
    } catch (err) {
        console.log('Error retrieving fMam access token');
        console.log(err);
    }
    return fMamBearerToken;
}

/**
 * Navigate a path through a set of entities to extract and return all entities at the end of that path
 * @param entity - An OMC-JSON set of entities
 * @param entityPath {String} - A dot delimited string of the path
 * @return {Array}
 */

function extractEntity(entity, entityPath) {
    const entities = makeArray(entity); // Make sure it is iterable
    const levels = entityPath.split('.'); // Split the path on '.'
    const target = levels.shift();
    return entities.flatMap((ent) => {
        if (!hasProp(ent, target)) return null; // If no relevant property return null
        return (levels.length !== 0) // Recurse down, until end of path has been reached
            ? extractEntity(ent[target], levels.join('.'))
            : ent[target];
    }).filter((ent) => ent !== null);
}

/**
 * Return all the particpants in the fMam
 * @return {Promise<*|{}>}
 */

async function allParticipants() {
    const queryName = 'allParticipants';
    const graphQlQuery = queryOptions[queryName]; // Pick one of the graphql queries and variables
    const { responsePath } = graphQlQuery; // Variables to navigate the response

    const bearerToken = await fMamToken();
    // console.log(`Bearer Token: ${bearerToken}`);

    const qlOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(graphQlQuery),
    };
    let fMamResponse = {};
    try {
        fMamResponse = await fetch(fMamUrl, qlOptions); // POST the graphql query
    } catch (err) {
        console.log(err);
    }

    let entities = []; // Process the response
    if (fMamResponse.status === 200) {
        const data = await fMamResponse.json();
        entities = data.data[responsePath]; // Strip relevant data from graphql formatted response
    } else {
        console.log(`Query failed: ${fMamResponse.statusText} (${fMamResponse.status})`);
    }
    console.log(entities);
    return entities;
}

async function mutateOmcPerson(omc) {
    const bearerToken = await fMamToken();
    const queryName = 'mutatePerson';
    const graphQlMutation = queryOptions[queryName]; // Pick one of the graphql queries and variables
    // delete omc.Person.entityType;
    const { query, responsePath } = graphQlMutation;
    const graphQlBody = {
        query,
        variables: omc,
    };

    const qlOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${bearerToken}`,
        },
        body: JSON.stringify(graphQlBody),
    };
    let fMamResponse = {};
    try {
        fMamResponse = await fetch(fMamUrl, qlOptions); // POST the graphql query
    } catch (err) {
        console.log(err);
    }

    console.log(fMamResponse);
    let entities = {}; // Process the response
    if (fMamResponse.status === 200) {
        const data = await fMamResponse.json();
        entities = data.data[responsePath]; // Strip relevant data from graphql formatted response
    } else {
        console.log(`Query failed: ${fMamResponse.statusText} (${fMamResponse.status})`);
        return entities;
    }

    const identifier = omc.Person.identifier.filter((id) => id.identifierScope === 'labkoat');
    console.log(`Update the fMam ${identifier[0].identifierValue}`);
    return entities;
}

module.exports = {
    fMamSetup,
    allParticipants,
    mutateOmcPerson,
};
