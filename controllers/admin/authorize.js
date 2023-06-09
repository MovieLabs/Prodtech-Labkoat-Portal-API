const { check } = require('../auth0Interface');

async function admin(req, res, next) {
    console.log('api/admin/policy');
    const { auth } = req;
    const user = `${auth.uid}`; // Use the email address as the primary identifier, held in the sub claim
    console.log(user);

    const allowed = await check({
        user: `user:${user}`,
        relation: 'hasRole',
        object: 'role:admin',
    });

    if (allowed) {
        next();
    } else {
        res.status(401).send('Unauthorized');
    }
}

async function view(req, res, next) {
    const {
        auth,
        body,
    } = req;
    // const user = body.user;
    const user = `user:${auth.uid}`;
    const { relation, object } = body;
    console.log(`Authorize: ${user}, ${object}, ${relation}`);
    const tuple = {
        user,
        relation,
        object,
    };
    const printable = `${tuple.user} / ${tuple.relation} / ${tuple.object}`;
    const allowed = await check(tuple);
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
