/**
Methods for interfacing with the Okta API
 */

const { allParticipants } = require('./okta/fMam');
const oktaInterface = require('../oktaInterface');
const auth0Interface = require('../auth0Interface');
const { omcToAuth0User, omcToAuth0Organization, labkoatMembers } = require('./auth0/auth0-omc-mapper');

const labkoatId = ((p) => (
    p.identifier.filter((i) => i.identifierScope === 'labkoat')
        .map((i) => i.identifierValue)
)[0]);

async function oktaSecurity(req, res) {
    console.log('Path: directory/security');
    const participants = await allParticipants(); // Test call to grab the participants that should be in Okta
    const people = participants.filter((p) => p.structuralCharacteristics.structuralType === 'participant.person')
    const oktaUpdate = people.map((p) => oktaInterface.oktaParticipant(p));
    const oktaResult = await Promise.all(oktaUpdate);

    const labkoatParticipants = labkoatMembers(participants); // Which participants are members of Labkoat
    const userTuple = await omcToAuth0User(labkoatParticipants); // Convert a single user
    const orgTuple = await omcToAuth0Organization(labkoatParticipants);
    await auth0Interface.writeTuple(userTuple); // Setup their roles in auth0fga
    await auth0Interface.writeTuple(orgTuple); // Add them as members to the labkoat organization

    res.status(200).send('ok');
}

module.exports = oktaSecurity;
