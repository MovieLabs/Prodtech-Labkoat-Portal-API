/**
 * Controllers for managing the Okta directory for the Labkoat portal
 * @module
 */

const okta = require('@okta/okta-sdk-nodejs');

const { allParticipants } = require('./okta/fMam');
const { listUsers } = require('../oktaInterface');

async function oktaDirectory(req, res) {
    console.log('Route: /directory');
    const { uid, sub } = req.auth; // User id or sub from the authorization token
    const staffClaim = req.auth['labkoat.api.staff'] || [];
    // const { authorization } = req.headers;
    // const token = authorization.replace('Bearer ', ''); // Extract bearer token

    const participants = await allParticipants(); // Test call to grab the participants that should be in Okta

    try {
        if (staffClaim.includes('Directory')) {
            const orgUsersCollection = await listUsers();
            const staff = [];
            await orgUsersCollection.each((user) => staff.push(user.profile));
            res.json({
                participants,
                staff,
                error: null,
                success: 'Directory call succeeded!',
                url: req.url,
            });
            return;
        }
    } catch (err) {
        res.json({
            error: err,
            success: null,
            url: req.url,
        });
        return;
    }
    res.status(401).send('Unauthorized');
}

module.exports = oktaDirectory;
