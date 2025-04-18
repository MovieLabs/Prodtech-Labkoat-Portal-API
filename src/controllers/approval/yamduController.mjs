/**
 Methods for interfacing with the Okta API
 */
import yamduFetch from './hpaApproval/yamduFetch.mjs';
import fMamDifference from './hpaApproval/fMamDifference.mjs';
import yamduTransaction from './hpaApproval/yamduTransaction.mjs';

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
