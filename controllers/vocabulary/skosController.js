/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

// const neoCache = require('../../neo4J/neoCache');
const skosCache = require('../../neo4J/skosCache');
const { neo4jUpdate } = require('../../neo4J/neo4jUpdate');

async function skosGet(req, res, neo4JInterface) {
    console.log('GET Route: /vocab/skos');

    const skosMap = skosCache.getCache();

    if (skosMap) {
        res.status(200)
            .json(skosMap);
        return;
    }
    res.status(400)
        .set('Content-Type', 'application/json')
        .send({ message: 'Entity did not resolve' });
}

async function skosPost(req, res, neo4JInterface) {
    console.log('POST Route: /vocab/skos');
    const { body } = req;
    console.log(body);

    const neo4jResponse = await neo4jUpdate(body, neo4JInterface);
    skosCache.updateAction(body); // Update the internal cache

    res.status(200)
        .json({ message: 'Ok' });
}

module.exports = {
    skosGet,
    skosPost,
};
