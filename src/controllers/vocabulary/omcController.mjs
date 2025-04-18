/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

import omcCache from '../../neo4J/omcCache.mjs';
import { neo4jUpdate } from '../../neo4J/neo4jUpdate.mjs';

async function omcGet(req, res, neo4Jdb) {
    console.log('GET Route: /vocab/omc');

    console.log('Auth: ');
    console.log(req.auth);
    // if (!req.auth.admin) {
    //     console.log('Auth denied');
    //     return res.sendStatus(401);
    // }

    await omcCache.loadCache(neo4Jdb);
    const omcMap = omcCache.getCache();

    if (omcMap) {
        res.status(200)
            .json(omcMap);
        return;
    }
    res.status(400)
        .set('Content-Type', 'application/json')
        .send({ message: 'Entity did not resolve' });
}

async function omcPost(req, res, neo4Jdb) {
    console.log('POST Route: /vocab/omc');
    const { body } = req;
    console.log(body);

    const neo4jResponse = await neo4jUpdate(body, neo4Jdb, 'OMC');
    omcCache.updateAction(body); // Update the internal cache

    // await omcCache.loadCache(neo4Jdb); // Reload the neo4Jcache

    res.status(200)
        .json({ message: 'Ok', result: neo4jResponse });
}

export {
    omcGet,
    omcPost,
};
