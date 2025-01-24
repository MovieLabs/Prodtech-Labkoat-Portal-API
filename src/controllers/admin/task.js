/**
 * Execute dynamic policy updates to the rules engine
 */

const { writeTuple, deleteTuple } = require('../auth0Interface');
const processTask = require('./processTask');
const db = require('../task/db');
const auth0Policies = require('../task/auth0Policy'); // auth0 tuples for the policies

const { hasProp } = require('../../helpers/util');
const { identifierOfScope } = require('../../helpers/omc');

/**
 * Delete a policy tuple or set of tuples
 * @param policy
 * @return {Promise<string|any>}
 */

async function taskList(req, res, next) {
    const { auth } = req;
    const user = `${auth.uid}`; // Use the email address as the primary identifier, held in the sub claim
    console.log(user);
    const publishTasks = db.get(user, { functionalType: 'publish' });
    const revokeTasks = db.get(user, { functionalType: 'revoke' });
    const reviewTasks = db.get(user, { functionalType: 'review' });
    return [...publishTasks, ...revokeTasks, ...reviewTasks];
}

async function taskExecute(req, res, next) {
    const { auth, body } = req;
    const user = `${auth.uid}`; // Use the email address as the primary identifier, held in the sub claim
    console.log(user);
    const taskEnt = db.get(user, body[0]);
    await processTask.runTask(taskEnt);
}

module.exports = {
    taskList,
    taskExecute,
};
