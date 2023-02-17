const { Auth0FgaApi } = require('@auth0/fga');

const fgaClient = new Auth0FgaApi({
    environment: process.env.FGA_ENVIRONMENT,
    storeId: process.env.FGA_STORE_ID,
    clientId: process.env.FGA_CLIENT_ID,
    clientSecret: process.env.FGA_CLIENT_SECRET,
});

const modelId = process.env.FGA_MODEL_ID;

async function admin(req, res, next) {
    console.log('api/auth0fga/admin');
    const {
        auth,
        body,
    } = req;
    // console.log(body);
    const user = `${auth.sub}`; // Use the email address as the primary identifier, held in the sub claim

    const { allowed } = await fgaClient.check({
        authorization_model_id: modelId,
        tuple_key: {
            user: `user:${user}`,
            relation: 'hasRole',
            object: 'role:admin',
        },
    });
    console.log(`Authz says: ${allowed}`);
    if (allowed) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
}

async function view(req, res, next) {
    // console.log('Authorize view');
    const {
        auth,
        body,
    } = req;
    // const user = body.user;
    const user = `user:${auth.sub}`;
    const { relation, object } = body;
    const tuple = {
        user,
        relation,
        object,
    };
    const printable = `${tuple.user} / ${tuple.relation} / ${tuple.object}`;
    const { allowed } = await fgaClient.check({
        authorization_model_id: modelId,
        tuple_key: tuple,
    });
    console.log(`${allowed ? 'Authorized:' : 'Denied'}: ${printable}`);
    if (allowed) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
}

module.exports = {
    admin,
    view,
};
