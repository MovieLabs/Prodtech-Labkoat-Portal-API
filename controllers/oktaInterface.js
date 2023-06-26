/**
 * Interface with Okta backend and operate on the users
 *
 * @module oktaInterface
 *
 * @typedef {Object} userProfile
 * @property {string} firstName User's first name
 * @property {string} lastName User's last name or family name
 * @property {string} email User's email address
 * @property {string} mobilePhone User's mobile number
 * @property {string} login
 */

const okta = require('@okta/okta-sdk-nodejs');
const { omcToOktaProfile, omcParticipantToPerson } = require('./directory/okta/okta-omc-mapper');
const { mutateOmcPerson } = require('./directory/okta/fMam');

let oktaClient = null;

async function oktaSetup(secrets) {
    const { LABKOAT } = secrets;
    oktaClient = new okta.Client({
        orgUrl: 'https://movielabs.okta.com/',
        token: LABKOAT.OKTA_API_TOKEN,
    });
}

/**
 * List the current users in the Okta directory
 * @return {Promise<void>}
 */

async function listUsers() {
    try {
        return oktaClient.listUsers();
    } catch (err) {
        console.log(err);
    }
    return null;
}

/**
 * Add a new user to the Okta directory
 * @type {userProfile}
 * @return {Promise<void>}
 */

async function addUser(userProfile) {
    const newUser = {
        profile: userProfile.profile,
        groupIds: [
            '00g3blcctMq98tDnU696', // labkoat.media
        ],
    };
    try {
        const res = await oktaClient.createUser(newUser);
        console.log(`Created new user in Okta ${res.id}`);
        return res;
    } catch (err) {
        console.log(err);
    }
    return null;
}

/**
 * Update an existing user in the Okta directory if parameters in the profile have changed
 * @type {userProfile}
 * @param oktaUser
 * @return {Promise<void>}
 */

async function updateUser(userProfile, oktaUser) {
    const changes = Object.keys(userProfile.profile).filter((k) => oktaUser.profile[k] !== userProfile.profile[k]);
    if (changes.length) {
        console.log(`Update user in Okta: ${oktaUser.id} / ${changes}`);
        changes.forEach((k) => oktaUser.profile[k] = userProfile.profile[k]); // Update the profile
        return oktaUser.update(); // Update the profile
    }
    return oktaUser;
}

/**
 * Check to identifiers and update the fMam if there is no Okta id present
 * @param omcParticipant
 * @param oktaUser
 * @return {Promise<void>}
 */

async function updatePerson(omcParticipant, oktaUser) {
    const omcPerson = await omcParticipantToPerson(omcParticipant);
    const oktaId = omcPerson.Person.identifier.filter((identifier) => identifier.identifierScope === 'okta');
    // If there is currently no Okta id in the OMC record, then add one
    if (oktaId.length === 0) {
        omcPerson.Person.identifier.push({
            identifierScope: 'okta',
            identifierValue: oktaUser.id,
        });
        console.log('Updating participant in fMam');
        const res = await mutateOmcPerson(omcPerson);
    }
}

/**
 * Check an OMC Participant against the Okta directory and update or add any differences
 * @param omcParticipant
 * @return {Promise<void>}
 */

async function oktaParticipant(omcParticipant) {
    const userProfile = await omcToOktaProfile(omcParticipant); // Convert a single user
    const oktaId = userProfile.id ? userProfile.id : userProfile.profile.email; // Use the directory id or email

    if (oktaId === null || oktaId === undefined) {
        console.log(`Missing profile identifier for ${userProfile.labkoatId}`);
        return null;
    }

    console.log(`Processing: ${oktaId}`);
    let oktaUser = null; // Check if there is a record in Okta and either update or add the participant
    try {
        oktaUser = await oktaClient.getUser(oktaId);
        await updateUser(userProfile, oktaUser); // Update user in Okta
        await updatePerson(omcParticipant, oktaUser); // Update the fMam with the Okta subscriber id
    } catch (err) {
        if (err.status === 404) {
            oktaUser = await addUser(userProfile); // Record did not exist, so add a new participant
            await updatePerson(omcParticipant, oktaUser);
        } else {
            // console.log(err.message);
            throw (err);
        }
    }
    return oktaUser;
}

module.exports = {
    oktaSetup,
    listUsers,
    addUser,
    updateUser,
    oktaParticipant,
};
