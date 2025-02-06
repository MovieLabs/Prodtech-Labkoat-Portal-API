/**
 Methods for interfacing with the Okta API
 */

import { fMamFetch } from '../fMamFetch.mjs';

import InternalError from '../../errors/InternalError.mjs';

import yamduResetOMC from './yamduResetOMC.mjs';

const fMamProject = 'yamdu';

export default async function resetHPAController(req, res, next) {
    console.log('Route: /admin/reset');

    try {
        const fMamResponse = await fMamFetch({
            next,
            method: 'POST',
            route: 'update',
            body: yamduResetOMC,
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
