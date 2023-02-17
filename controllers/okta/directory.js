const okta = require('@okta/okta-sdk-nodejs');

const { OKTA_API_TOKEN } = process.env;
const oktaClient = new okta.Client({
    orgUrl: 'https://movielabs.okta.com/',
    token: OKTA_API_TOKEN,
});

async function oktaDirectory(req, res) {
    const { uid, sub } = req.auth;
    const staffClaim = req.auth['labkoat.api.staff'] || [];
    // const { authorization } = req.headers;
    // const token = authorization.replace('Bearer ', ''); // Extract bearer token

    console.log(`Okta Uid: ${uid}`);
    console.log(`Email: ${sub}`);
    console.log(`Claims: ${staffClaim}`);

    try {
        if (staffClaim.includes('Directory')) {
            const orgUsersCollection = oktaClient.listUsers();
            const staff = [];
            await orgUsersCollection.each((user) => staff.push(user.profile));
            res.json({
                staff,
                error: null,
                success: 'Directory call succeeded!',
                url: req.url,
            });
        }
    } catch (err) {
        res.json({
            error: err,
            success: null,
            url: req.url,
        });
    }
    res.status(401).send('Unauthorized');
}

module.exports = oktaDirectory;
