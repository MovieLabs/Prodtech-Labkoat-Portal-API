const okta = require('@okta/okta-sdk-nodejs');

const { OKTA_API_TOKEN } = process.env;
const oktaClient = new okta.Client({
    orgUrl: 'https://movielabs.okta.com/',
    token: OKTA_API_TOKEN,
});

async function oktaUser(req, res) {
    const { uid, sub } = req.auth;

    try {
        const oktaUser = await oktaClient.getUser(uid);
        console.log(oktaUser);
        res.json(oktaUser);
    } catch (err) {
        res.json({
            error: err,
            success: null,
            url: req.url,
        });
    }
    res.status(401).send('Unauthorized');
}

module.exports = oktaUser;
