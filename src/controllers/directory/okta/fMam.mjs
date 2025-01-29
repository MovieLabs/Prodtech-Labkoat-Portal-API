/**
 * Interface to the fMam primarily for updating the Participants
 */

import fetch from 'node-fetch';

// const btoa = require('btoa');
// const request = require('request-promise');
import { makeArray, hasProp } from '../../../helpers/util.mjs';
import { serviceToken } from '../../../helpers/serviceToken.mjs';

import config from '../../../../config.mjs';
import allCharactersQuery from '../query/allCharacters.mjs';
import allStoryboardsQuery from '../query/allStoryboards.mjs';
import allParticipantsQuery from '../query/allParticipants.mjs';
import mutatePersonQuery from '../query/mutationPerson.mjs';

const queryOptions = {
    allCharacters: allCharactersQuery,
    allStoryboards: allStoryboardsQuery,
    allParticipants: allParticipantsQuery,
    mutatePerson: mutatePersonQuery,
};

const fMamUrl = config.FMAM_URL; // Base Url for the fMam

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

    // const bearerToken = await fMamToken();
    const bearerToken = await serviceToken();
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
    const bearerToken = await serviceToken();
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

export {
    allParticipants,
    mutateOmcPerson,
};
