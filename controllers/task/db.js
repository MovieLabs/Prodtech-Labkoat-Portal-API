/**
 * An in memory, temp db for storing tasks
 *
 * Tasks are stored by their Okta user Id
 */

const { hasProp } = require('../../helpers/util');
const omc = require('../../helpers/omc');

const taskDb = {};

function add(oktaId, ent) {
    if (!hasProp(taskDb, oktaId)) taskDb[oktaId] = [];
    taskDb[oktaId].push(ent); // ToDo: Should probably make sure the task with this Id is not already in db
    return true;
}

function get(oktaId, params) {
    if (!hasProp(taskDb, oktaId)) {
        console.log(`No user tasks in the db for ${oktaId}`);
        return [];
    }
    let response = [];
    if (hasProp(params, 'functionalType')) {
        response = taskDb[oktaId].filter((ent) => omc.functionalType(ent) === params.functionalType);
    }
    if (hasProp(params, 'identifierValue')) {
        response = taskDb[oktaId].filter((ent) => (
            ent.identifier.filter((id) => id.identifierValue === params.identifierValue)
        ).length);
    }
    return response;
}

function remove(oktaId, identifierValue){
    if (!hasProp(taskDb, oktaId)) {
        console.log(`No user tasks in the db for ${oktaId}`);
        return [];
    }
    const removed = taskDb[oktaId].filter((ent) => {
        const matches = ent.identifier.filter((id) => id.identifierValue === identifierValue).length;
        return !matches;
    });
    taskDb[oktaId] = removed; // The entries without the revoked task
    return null;
}

module.exports = {
    add,
    get,
    remove,
};
