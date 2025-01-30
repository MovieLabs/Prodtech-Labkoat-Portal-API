/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

import fMamFetch from '../fMamFetch.mjs';

async function entityController(req, res) {
    console.log('Route: /omc/entity');

    const {
        identifierScope,
        identifierValue,
        project,
    } = req.query;
    console.log(`Get data for ${project} - Scope: ${identifierScope}, Value: ${identifierValue}`);

    if (project === undefined) {
        res.status(400)
            .set('Content-Type', 'application/json')
            .send({ message: 'Missing project' });
        return;
    }

    const fMamResponse = await fMamFetch({
        res,
        method: 'GET',
        route: 'identifier',
        params: `identifierScope=${identifierScope}&identifierValue=${identifierValue}`,
        project,
    });

    res.status(fMamResponse.status)
        .set('Content-Type', 'application/json')
        .send(fMamResponse.payload);
}

export default entityController;
