/**
 * `/api/user/v1` — what belongs to the signed-in user: their remembered preferences.
 *
 * People only. A machine token names a client and nobody, so there is no one whose settings it
 * could read. The user is the token's `sub`, which is stable for the life of the account.
 *
 * @module routes/user-v1-router
 */

import express from 'express';
import { cognitoValidator } from 'mlHelpers';

import config from '../config.js';
import { readSettings, writeSettings } from '../user/settings.js';

import { writeFailed } from './vocabGuards.js';

/** A user of the Portal's app client in the labkoat group, as the vocabulary routes accept. */
const userOnly = cognitoValidator({
    userPoolId: config.USER_POOL_ID,
    user: { clientId: config.CLIENT_ID, group: 'labkoat' },
});

/**
 * The token's subject, or a 401 when it has none.
 *
 * @param {object} req
 * @param {object} res
 * @param {Function} next
 */
function subject(req, res, next) {
    const sub = req.user?.sub;
    if (!sub) {
        res.status(401).json({ message: 'The token names no user' });
        return;
    }
    req.settingsUser = sub;
    next();
}

const router = express.Router();

/** Everything the user has stored, as `{ values, projects }`. */
router.get('/settings', userOnly, subject, async (req, res, next) => {
    try {
        res.set('Cache-Control', 'no-store');
        res.json(await readSettings(req.settingsUser));
    } catch (err) {
        next(err);
    }
});

/**
 * Change some settings. Only the settings named are touched; a null value removes one. Answers
 * `{ changed }`, or 422 with every problem in the body.
 */
router.patch('/settings', userOnly, subject, async (req, res, next) => {
    try {
        res.json(await writeSettings(req.settingsUser, req.body ?? {}));
    } catch (err) {
        writeFailed(err, res, next);
    }
});

export default router;
