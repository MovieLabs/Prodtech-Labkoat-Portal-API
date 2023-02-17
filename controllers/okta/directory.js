const okta = require('@okta/okta-sdk-nodejs');

async function oktaDirectory(req, res) {
    const { OKTA_API_TOKEN } = process.env;

    const oktaClient = new okta.Client({
        orgUrl: 'https://movielabs.okta.com/',
        token: OKTA_API_TOKEN,
    });

    const { uid, sub } = req.auth;
    const staffClaim = req.auth['labkoat.api.staff'] || [];
    const { authorization } = req.headers;
    const token = authorization.replace('Bearer ', ''); // Extract bearer token
    console.log(`Okta Uid: ${uid}`);
    console.log(`Email: ${sub}`);
    console.log(`Claims: ${staffClaim}`);
    console.log(`Token: ${token}`);

    const staff = [];
    let staffErr = null;

    try {
        // if (clnClaims['labkoat.api.staff'].includes('Directory')) {
            const orgUsersCollection = oktaClient.listUsers();
            await orgUsersCollection.each((user) => staff.push(user.profile));

            // If authorized add the payroll information
            if (staffClaim.includes('Payroll')) {
                staff.forEach((stf) => {
                    stf.payroll = '$1,000';
                });
            //}
        }
    } catch (err) {
        staffErr = err;
    }

    res.json({
        // token: OKTA_API_TOKEN,
        staff,
        error: staffErr,
        success: 'get call succeed!',
        url: req.url,
    });
}

module.exports = oktaDirectory;
