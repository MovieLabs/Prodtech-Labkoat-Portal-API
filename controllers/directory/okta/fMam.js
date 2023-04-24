/**
 * Interface to the fMam primarily for updating the Participants
 */

const fetch = require('node-fetch');

const { makeArray, hasProp } = require('../../../util/util');

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

// Secrets are obtained from AWS secrets manager asynchronously
let awsSecrets = null;
async function fMamSetup(secrets) {
    awsSecrets = secrets.FMAM;
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
    const storageToken = awsSecrets.FMAM_TOKEN || 'temp';
    const queryName = 'allParticipants';
    const graphQlQuery = queryOptions[queryName]; // Pick one of the graphql queries and variables
    const { responsePath } = graphQlQuery; // Variables to navigate the response

    const qlOptions = {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${storageToken}`,
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
    return entities;
}

async function mutateOmcPerson(omc) {
    const storageToken = awsSecrets.FMAM_TOKEN || 'temp';
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
            Authorization: `Bearer ${storageToken}`,
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

    const identifier = omc.identifier.filter((id) => id.identifierScope === 'labkoat');
    console.log(`Update the fMam ${identifier[0].identifierValue}`);
    return entities;
}

module.exports = {
    fMamSetup,
    allParticipants,
    mutateOmcPerson,
};
