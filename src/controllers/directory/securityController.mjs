/**
Methods for interfacing with the Okta API
 */

import { allParticipants } from './okta/fMam.mjs';
import oktaInterface from '../oktaInterface.mjs';
import auth0Interface from '../auth0Interface';
import { omcToAuth0User, omcToAuth0Organization, labkoatMembers } from './auth0/auth0-omc-mapper';

async function oktaSecurity(req, res) {
    console.log('Path: directory/security');
    const participants = await allParticipants(); // Test call to grab the participants that should be in Okta
    const people = participants.filter((p) => p.structuralCharacteristics.structuralType === 'person');
    const oktaUpdate = people.map((p) => oktaInterface.oktaParticipant(p));
    const oktaResult = await Promise.all(oktaUpdate);

    const labkoatParticipants = labkoatMembers(participants); // Which participants are members of Labkoat
    const userTuple = await omcToAuth0User(labkoatParticipants); // Convert a single user
    const orgTuple = await omcToAuth0Organization(labkoatParticipants);
    await auth0Interface.writeTuple(userTuple); // Setup their roles in auth0fga
    await auth0Interface.writeTuple(orgTuple); // Add them as members to the Labkoat organization

    res.status(200).send('ok');
}

export default oktaSecurity;
