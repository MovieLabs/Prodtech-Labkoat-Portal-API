import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import {
    listProjects,
    createProject,
    updateProject,
    removeProject,
    resetProject,
} from '../controllers/admin/projects.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

// router.get('/reset', resetHpa);
router.get('/project', listProjects);
router.post('/project', createProject);
router.patch('/project', updateProject);
router.delete('/project', removeProject);
router.delete('/reset', resetProject)

export default router;
