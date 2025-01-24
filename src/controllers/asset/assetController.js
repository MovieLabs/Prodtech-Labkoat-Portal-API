/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

const fMam = require('../../fMam/fMam');
const omc = require('../../helpers/omc');
const { hasProp } = require('../../helpers/util');

// If this is an Asset Group the primary Identifier is return, otherwise the essence identifier
const essenceId = ((ent) => (
    ent.AssetSC.structuralType.toLowerCase() === 'assetgroup'
        ? omc.identifierOfScope(ent.identifier, 'labkoat')
        : omc.identifierOfScope(ent.AssetSC.identifier, 'labkoat')
));

const stripAsset = ((ent) => ({
    identifierValue: essenceId(ent),
    name: ent.name,
    description: ent.description,
    Asset: (hasProp(ent, 'Asset') && ent.Asset !== null) ? ent.Asset.map((ent1) => stripAsset(ent1)) : null,
}));

async function info(req, res) {
    console.log('Route: /asset/info');
    const { query } = req;
    if (hasProp(query, 'functionalType')) {
        const omcResponse = await fMam.getAssetType({ functionalType: query.functionalType });
        const ast = omcResponse.map((ent) => stripAsset(ent));
        res.status(200)
            .json(ast);
        return;
    }
    console.log('Error: No functional type');
    res.status(400)
        .set('Content-Type', 'application/json')
        .send({ message: 'Missing functionalType' });
}

module.exports = {
    info,
};
