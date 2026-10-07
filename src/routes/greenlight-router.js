/**
 * The Greenlight routes: an internal test bench, and the submissions a caller posts from a script
 * and then publishes from the Portal.
 *
 * The submission contract is written down in `Labkoat-Portal/docs/greenlight-contract.md`. Change a
 * shape here and change it there.
 */

import express from 'express';
import { awsJwtValidator, cognitoValidator } from 'mlHelpers';

import config from '../config.js';
import {
    createSubmissionController,
    greenlightPingController,
    listSubmissionsController,
    publishSubmissionController,
} from '../controllers/greenlight/greenlight-controller.js';
import { GREENLIGHT_GROUP } from '../greenlight/access.js';

/**
 * A user of the Portal's app client in a `greenlight` group, under any organisation. The same
 * person posts from a script (Cognito SRP login) and publishes from the Portal (PKCE login); both
 * tokens carry the same `sub`, which is what joins the two.
 */
const greenlightAccess = cognitoValidator({
    userPoolId: config.USER_POOL_ID,
    user: { clientId: config.CLIENT_ID, group: GREENLIGHT_GROUP },
});

const router = express.Router();

router.post('/ping', awsJwtValidator, greenlightPingController);

router.post('/submissions', greenlightAccess, createSubmissionController);
router.get('/submissions', greenlightAccess, listSubmissionsController);
router.post('/submissions/:id/publish', greenlightAccess, publishSubmissionController);

export default router;
