/**
    Process an incoming task and move into or out of tasklists
 */

const db = require('../task/db');
const omc = require('../../helpers/omc');
const generateId = require('../../helpers/generateID');
const { recursiveDeepCopy, hasProp, makeArray } = require('../../helpers/util');
const { identifierOfScope } = require('../../helpers/omc');
const { updatePolicy } = require('./policy');

const externalUser = '00u4dm2mnhf0m6enO697'; // Grosvner Eudora
// const externalUser = '00u55sz1a81S9Bavw697'; // Matt Daw

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

const executePublish = ((ent) => {
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
    const policy = {
        user: externalUser,
        action: 'allow',
    };
    updatePolicy(policy, asset);
});

const executeRevoke = ((ent) => {
    console.log('Execute Revoke task');
    const labkoatId = identifierOfScope(ent.identifier, 'labkoat');
    console.log(labkoatId);
    db.remove(externalUser, 'rev-1'); // User id with the review task and the id to remove.
    const asset = ent?.functionalCharacteristics?.functionalProperties?.Asset;
    const policy = {
        user: externalUser,
        action: 'deny',
    };
    updatePolicy(policy, asset);
});

const taskExecute = {
    publish: executePublish,
    revoke: executeRevoke,
};

/**
 * Initilize or setup a new task
 * @param omcJson
 */
function newTask(omcJson) {
    omcJson.forEach((ent) => {
        const functionalType = omc.functionalType(ent);
        console.log(functionalType);
        taskSetup[functionalType](ent);
    });
}

/**
 * Execute or run a task
 * @param omcJson
 */
function runTask(omcJson) {
    const allTasks = makeArray(omcJson);
    allTasks.forEach((ent) => {
        const functionalType = omc.functionalType(ent);
        console.log(functionalType);
        taskExecute[functionalType](ent);
    });
    return null;
}

module.exports = {
    newTask,
    runTask,
};
