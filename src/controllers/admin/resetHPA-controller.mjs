/**
 Methods for interfacing with the Okta API
 */

import { fMamFetch } from '../fMamFetch.mjs';

import InternalError from '../../errors/InternalError.mjs';

import yamduResetOMC from './yamduResetOMC.mjs';

const fMamProject = 'yamdu';

export default async function resetHPAController(req, res, next) {
    console.log(`${req.method}: ${req.route.path}`);

    const identifier = [
        {
            identifierScope: 'yamdu',
            identifierValue: 'HPA',
        },
        {
            identifierScope: 'com.yamdu.app',
            identifierValue: 'com.yamdu.app.scene.2475847',
        },
        {
            identifierScope: 'movielabs.com/omc/yamdu',
            identifierValue: '01ef72720e5ceee2babb308b7a3394c0',
        },
        {
            identifierScope: 'yamdu',
            identifierValue: 'HPA',
        },
    ];

    try {
        const fMamResponse = await fMamFetch({
            next,
            method: 'POST',
            route: 'identifier',
            body: identifier,
            query: {
                project: fMamProject,
                atomic: true,
                response: 'verbose',
            },
        });
        if (fMamResponse.status === 500) {
            next(new InternalError(fMamResponse.payload));
            return;
        }
        console.log(fMamResponse.payload);

        res.status(fMamResponse.status)
            .json(fMamResponse.payload)
            .end();
    } catch (err) {
        console.log(err);
        next(new InternalError('Unknown error'));
    }
}
