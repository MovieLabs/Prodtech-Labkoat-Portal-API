/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

const fMam = require('../../fMam/fMam');
const omc = require('../../helpers/omc');
const { hasProp } = require('../../helpers/util');

// If this is an Asset Group the primary Identifier is return, otherwise the essence identifier
const essenceId = ((ent) => (
    ent.structuralCharacteristics.structuralType.toLowerCase() === 'assetgroup'
        ? omc.identifierOfScope(ent.identifier, 'labkoat')
        : omc.identifierOfScope(ent.structuralCharacteristics.identifier, 'labkoat')
));

const stripAsset = ((ent) => ({
    identifierValue: essenceId(ent),
    name: ent.name,
    description: ent.description,
    Asset: hasProp(ent, 'Asset') ? ent.Asset.map((ent1) => stripAsset(ent1)) : null,
}));

async function storyboard(req, res) {
    console.log('Route: /asset/storyboard');
    const { uid, sub } = req.auth; // User id or sub from the authorization token
    // const authorized = true; // TODO: Check if user is authorized to view directory
    const omcStoryboard = await fMam.getAssetType({ functionalType: 'artwork.storyboard' });
    const sb = omcStoryboard.map((ent) => stripAsset(ent));

    try {
        res.status(200).json(sb);
    } catch (err) {
        res.json({
            error: err,
            success: null,
            url: req.url,
        });
    }
}

async function concept(req, res) {
    console.log('Route: /asset/concept');
    const { uid, sub } = req.auth; // User id or sub from the authorization token
    console.log();

    try {
        res.status(200).json({
            concept: {},
        });
    } catch (err) {
        res.json({
            error: err,
            success: null,
            url: req.url,
        });
    }
}

module.exports = {
    storyboard,
    concept,
};
