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
    const authorized = true; // TODO: Check if user is authorized to view directory
    const participants = await allParticipants(); // Test call to grab the participants that should be in Okta

    try {
        if (authorized) {
            const orgUsersCollection = await listUsers();
            const staff = [];
            await orgUsersCollection.each((user) => staff.push(user.profile));
            res.status(200).json({
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
