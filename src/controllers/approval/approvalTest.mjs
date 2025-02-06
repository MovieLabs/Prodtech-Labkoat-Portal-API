/**
 Methods for interfacing with the Okta API
 */

import { query } from '../../fMam/fMam.mjs';
import { fMamFetch } from '../fMamFetch.mjs';

const fMamProject = 'yamdu';

async function approvalTest(req, res, next) {
    console.log('Path: approval/token-exchange');

    const token = req.headers.authorization?.split(' ')[1];

    const entityType = 'Character';
    const fMamResponse = await fMamFetch({
        next,
        method: 'GET',
        route: `entityType/${entityType}`,
        query: {
            project: fMamProject,
            instanceInfo: true,
        },
    });

    const graphqlResponse = await query('allCharacters', {}, token);
    // console.log(`Retrieved ${graphqlResponse.length} entities from fMam\n`);

    res.status(fMamResponse.status).json(fMamResponse.payload);
}

export default approvalTest;
