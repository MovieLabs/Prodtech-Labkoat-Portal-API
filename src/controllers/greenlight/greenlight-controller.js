/**
 * Controllers for the Greenlight tab: an internal test bench in the Portal, for anything that needs a
 * page to display or trigger it.
 * @module
 */

import { claimedActor } from '../../auth/actor.js';

/**
 * Echo the request back, with who sent it, so the Portal can prove its round trip works.
 * @param req
 * @param res
 * @returns {void}
 */
export function greenlightPingController(req, res) {
    res.status(200).json({
        received: req.body ?? null,
        caller: claimedActor(req),
        at: new Date().toISOString(),
    });
}
