const express = require('express');
const jwtValidator = require('../helpers/JwtValidator');

const config = require('../config');

const {
    connection,
    connectionHealth,
} = require('../mongo/management/mongo-operations');
const entityController = require('../controllers/omc/omcController');

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

let db = null; // Mongo DB database connection
let projectDb = null; // Mongo DB database connections

async function omcSetup(secrets) {
    const { FMAM } = secrets;
    const {
        FMAM_MONGO_USER,
        FMAM_MONGO_PASSWORD,
    } = FMAM;
    const { projects } = config; // Setup database connections for each of the projects
    console.log(projects);
    const mongoOptions = {
        username: FMAM_MONGO_USER,
        password: FMAM_MONGO_PASSWORD,
        mongoUrl: config.FMAM_MONGO_URL,
        dbName: config.FMAM_MONGO_DB,
    };
    db = await connection(mongoOptions);
    const health = await connectionHealth(mongoOptions);

    try {
        const projectNames = Object.keys(projects);
        const connections = projectNames.map((pName) => {
            const mOptions = {
                username: FMAM_MONGO_USER,
                password: FMAM_MONGO_PASSWORD,
                mongoUrl: config.FMAM_MONGO_URL,
                dbName: projects[pName],
            };
            return connection(mOptions);
        });

        const mongoConnections = await Promise.all(connections);
        projectDb = mongoConnections.reduce((obj, db1, i) => ({ ...obj, ...{ [projectNames[i]]: db1 } }), {});

        console.log(projectDb);
    } catch (err) {
        console.log(err);
    }

    // console.log(health);
}

router.get('/entity', checkJwt, ((req, res) => entityController(req, res, projectDb)));

module.exports = {
    omcSetup,
    omcRouter: router,
};
