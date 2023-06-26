/**
    Process an incoming task and move into or out of tasklists
 */

const db = require('../task/db');
const omc = require('../../helpers/omc');
const generateId = require('../../helpers/generateID');
const { recursiveDeepCopy, hasProp, makeArray } = require('../../helpers/util');
const { identifierOfScope } = require('../../helpers/omc');
const { updatePolicy } = require('./policy');

const GrosvnerEudora = '00u4dm2mnhf0m6enO697';
const HermanMalinalli = '00u3bk42mac7miomA696';
const MattDaw = '00u55sz1a81S9Bavw697';
const externalUser = [MattDaw, HermanMalinalli];

/**
 * Set a publish task
 */
const setupPublish = ((ent) => {
    const functionalProps = omc.functionalProperties(ent);
    const person = omc.extractFromEntity(functionalProps, 'Participant.structuralCharacteristics.Person');
    const personId = person.map((e) => omc.identifierOfScope(e.identifier, 'okta'))[0]; // This is who the task is for

    const revokeTask = recursiveDeepCopy(ent); // Make a copy, which will be the revoke task
    revokeTask.functionalCharacteristics.functionalType = 'revoke'; // Everything is the same, but the task itself
    revokeTask.identifier = [{
        identifierScope: 'labkoat',
        // identifierValue: generateId.entity('tsk'),
        identifierValue: 'pub-2', // ToDo: This really should be generated, but has to point to correct tuple set (Need to generate these from OMC)
    }];
    db.add(personId, ent);
    db.add(personId, revokeTask);
});

const taskSetup = {
    publish: setupPublish,
};

const executePublish = (async (ent) => {
    console.log('Execute Publish task');
    const labkoatId = identifierOfScope(ent.identifier, 'labkoat');
    console.log(labkoatId);
    const reviewTask = recursiveDeepCopy(ent);
    reviewTask.functionalCharacteristics.functionalType = 'review'; // Everything is the same, but the task itself
    reviewTask.identifier = [{
        identifierScope: 'labkoat',
        // identifierValue: generateId.entity('tsk'),
        identifierValue: 'rev-1', // ToDo: This really should be generated
    }];
    db.add(externalUser, reviewTask);
    const asset = ent?.functionalCharacteristics?.functionalProperties?.Asset;
    externalUser.forEach((user) => {
        const policy = {
            user,
            action: 'allow',
        };
        updatePolicy(policy, asset);
    });
});

const executeRevoke = (async (ent) => {
    console.log('Execute Revoke task');
    const labkoatId = identifierOfScope(ent.identifier, 'labkoat');
    console.log(labkoatId);
    db.remove(externalUser, 'rev-1'); // User id with the review task and the id to remove.
    const asset = ent?.functionalCharacteristics?.functionalProperties?.Asset;
    externalUser.forEach((user) => {
        const policy = {
            user,
            action: 'deny',
        };
        updatePolicy(policy, asset); // ToDo: async action
    });
});

const taskExecute = {
    publish: executePublish,
    revoke: executeRevoke,
};

/**
 * Initilize or setup a new task
 * @param omcJson
 */
async function newTask(omcJson) {
    const task = omcJson.map((ent) => {
        const functionalType = omc.functionalType(ent);
        console.log(functionalType);
        return taskSetup[functionalType](ent);
    });
    await Promise.all(task);
}

/**
 * Execute or run a task
 * @param omcJson
 */
async function runTask(omcJson) {
    const allTasks = makeArray(omcJson);
    const task = allTasks.map((ent) => {
        const functionalType = omc.functionalType(ent);
        console.log(functionalType);
        return taskExecute[functionalType](ent);
    });
    await Promise.all(task);
    return null;
}

module.exports = {
    newTask,
    runTask,
};
