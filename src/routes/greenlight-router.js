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

/** A user of the Portal's app client in a `greenlight` group, under any organisation. */
const user = { clientId: config.CLIENT_ID, group: GREENLIGHT_GROUP };

/** A configured machine client holding the greenlight scope; none until one is configured. */
const machineClients = Object.keys(config.GREENLIGHT_CLIENTS);
const machine = machineClients.length ? { clientId: machineClients, scope: config.GREENLIGHT_SCOPE } : null;

/** Posting: a person, from a script or the Portal, or a machine client. */
const submitAccess = cognitoValidator({ userPoolId: config.USER_POOL_ID, user, machine });

/** Listing and publishing: people only, so a job is always approved by someone. */
const approveAccess = cognitoValidator({ userPoolId: config.USER_POOL_ID, user });

const router = express.Router();

router.post('/ping', awsJwtValidator, greenlightPingController);

router.post('/submissions', submitAccess, createSubmissionController);
router.get('/submissions', approveAccess, listSubmissionsController);
router.post('/submissions/:id/publish', approveAccess, publishSubmissionController);

export default router;
