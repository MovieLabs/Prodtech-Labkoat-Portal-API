import express from 'express';
import jwtValidator from '../helpers/JwtValidator.mjs';

import config from '../../config.mjs';

import resetHpa from '../controllers/admin/resetHPA-controller.mjs';
import { updatedNarLocation } from '../controllers/admin/hpaTest.mjs';
import { listProjects, createProject, updateProject, removeProject } from '../controllers/admin/projects.mjs';
import { proxyController } from '../controllers/omc/omc-controller.mjs';

const router = express.Router();

const checkJwt = jwtValidator({
    jwksUri: config.JWKS_URI,
    audience: config.AUDIENCE,
    issuer: config.ISSUER,
});

router.get('/reset', resetHpa);
router.get('/testcharacter', updatedNarLocation);
router.get('/project', listProjects);
router.post('/project', createProject);
router.patch('/project', updateProject);
router.delete('/project', removeProject);

export default router;
