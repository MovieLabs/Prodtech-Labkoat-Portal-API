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
const VitalyPetrof = '00u667tedivZRlIhm697';
const HermanMalinalli = '00u3bk42mac7miomA696';
const MattDaw = '00u55sz1a81S9Bavw697';
const externalUser = [MattDaw, VitalyPetrof];

/**
 * Set a publish task
 */
const setupPublish = ((ent) => {
    const functionalProps = omc.functionalProperties(ent);
    const person = omc.extractFromEntity(functionalProps, 'Participant.structuralCharacteristics.Person');
    const personId = person.map((e) => omc.identifierOfScope(e.identifier, 'okta'))[0]; // This is who the task is for
    const taskId = omc.identifierOfScope(ent.identifier, 'labkoat');

    const revokeTask = recursiveDeepCopy(ent); // Make a copy, which will be the revoke task
    revokeTask.functionalCharacteristics.functionalType = 'revoke'; // Everything is the same, but the task itself
    revokeTask.identifier = [{
        identifierScope: 'labkoat',
        // identifierValue: generateId.entity('tsk'),
        identifierValue: `${taskId}-b`, // ToDo: This really should be generated, but has to point to correct tuple set (Need to generate these from OMC)
    }];
    db.add(personId, ent);
    db.add(personId, revokeTask);
});

const taskSetup = {
    publish: setupPublish,
};

/**
 * Executes a request from the portal to publish a set of assets
 * @type {(function(*): Promise<void>)|*}
 */

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
    externalUser.forEach((oktaId) => {
        db.add(oktaId, reviewTask);
    });
    const asset = ent?.functionalCharacteristics?.functionalProperties?.Asset;
    externalUser.forEach((user) => {
        const policy = {
            user,
            action: 'allow',
        };
        updatePolicy(policy, asset);
    });
});

/**
 * Executes a revoke request from the portal on a set of assets, removing permissions for a user to view them
 * @type {(function(*): Promise<void>)|*}
 */

const executeRevoke = (async (ent) => {
    console.log('Execute Revoke task');
    const labkoatId = identifierOfScope(ent.identifier, 'labkoat');
    console.log(labkoatId);
    // User id with the review task and the id to remove.
    externalUser.forEach((oktaId) => {
        db.remove(oktaId, 'rev-1');
    });
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
