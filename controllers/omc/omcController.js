/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

// const fMam = require('../../fMam/fMam');
// const omc = require('../../helpers/omc');
// const { hasProp } = require('../../helpers/util');
// const { byIdentifier } = require('../../mongo/query/mongo-entity');
const { entityByIdentifier } = require('../../mongo/query/entityByIdentifier');

async function entityController(req, res, projectDb) {
    console.log('Route: /omc/entity');

    const { identifierScope, identifierValue, project } = req.query;
    console.log(`Get data for ${project} - Scope: ${identifierScope}, Value: ${identifierValue}`);

    if (project === undefined) {
        res.status(400)
            .set('Content-Type', 'application/json')
            .send({ message: 'Missing project' });
        return;
    }

    try {
        const db = projectDb[project]; // Use the connection for this project
        // const testEnt = await byIdentifier(db, {
        //     identifierScope,
        //     identifierValue,
        // });

        const testEnt = await entityByIdentifier(db, { identifierScope, identifierValue });
        console.log(testEnt);

        if (testEnt) {
            res.status(200)
                .json(testEnt);
            return;
        }
        console.log('Error from Mongo');
        res.status(400)
            .set('Content-Type', 'application/json')
            .send({ message: 'Database Error' });
        return;
    } catch (err) {
        console.log('Error: Entity did not resolve');
        res.status(400)
            .set('Content-Type', 'application/json')
            .send({ message: 'Entity did not resolve' });
    }
}

module.exports = entityController;
