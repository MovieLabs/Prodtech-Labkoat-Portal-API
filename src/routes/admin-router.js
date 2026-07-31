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

// Every route is authenticated, including the mutations. Only the read used to be: creating,
// editing, resetting and deleting a project were all reachable without a token, and reset and
// delete now destroy stored files as well as database contents.
router.get('/project', awsJwtValidator, listProjects);
router.post('/project', awsJwtValidator, createProject);
router.patch('/project', awsJwtValidator, updateProject);
router.delete('/project', awsJwtValidator, removeProject);
router.delete('/reset', awsJwtValidator, resetProject);

export default router;
