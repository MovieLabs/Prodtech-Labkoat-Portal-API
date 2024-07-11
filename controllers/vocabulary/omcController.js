/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

const omcCache = require('../../neo4J/omcCache');
const { neo4jUpdate } = require('../../neo4J/neo4jUpdate');

async function omcGet(req, res, neo4Jdb) {
    console.log('GET Route: /vocab/omc');

    await omcCache.loadCache(neo4Jdb);
    const omcMap = omcCache.getCache();
    // console.log(omcMap);

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

module.exports = {
    omcGet,
    omcPost,
};
