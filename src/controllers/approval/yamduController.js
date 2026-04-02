/**
 Methods for interfacing with the Okta API
 */
import yamduFetch from './hpaApproval/yamduFetch.js';
import fMamDifference from './hpaApproval/fMamDifference.js';
import yamduTransaction from './hpaApproval/yamduTransaction.js';

let yamduKey = null;

export function yamduSetup(secrets) {
    yamduKey = secrets.LABKOAT.YAMDU_KEY;
}

export async function yamduController(req, res, next) {
    console.log('Path: approval/yamdu');
    const yamduOmc = await yamduFetch(req, res, next);
    const yamduDiff = await fMamDifference(yamduOmc, next);
    //  const testTransaction = yamduTransaction(yamduDiff);
    res.json(yamduDiff);
}
