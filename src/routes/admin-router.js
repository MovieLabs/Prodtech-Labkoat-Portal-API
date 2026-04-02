import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import {
    listProjects,
    createProject,
    updateProject,
    removeProject,
    resetProject,
} from '../controllers/admin/projects.js';

const router = express.Router();

router.get('/project', awsJwtValidator, listProjects);
router.post('/project', createProject);
router.patch('/project', updateProject);
router.delete('/project', removeProject);
router.delete('/reset', resetProject);

export default router;
