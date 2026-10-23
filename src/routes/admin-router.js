import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import {
    listProjects,
    createProject,
    updateProject,
    removeProject,
    resetProject,
} from '../controllers/admin/projects.js';
import { templateHandlers } from '../controllers/templates.js';

const router = express.Router();

// Every route is authenticated, including the mutations. Only the read used to be: creating,
// editing, resetting and deleting a project were all reachable without a token, and reset and
// delete now destroy stored files as well as database contents.
router.get('/project', awsJwtValidator, listProjects);
router.post('/project', awsJwtValidator, createProject);
router.patch('/project', awsJwtValidator, updateProject);
router.delete('/project', awsJwtValidator, removeProject);
router.delete('/reset', awsJwtValidator, resetProject);

// The CSV templates alone, for Portal builds that predate /api/templates. Remove once none is deployed.
const csvTemplates = templateHandlers('/mappingTemplate');
router.get('/mappingTemplate', awsJwtValidator, csvTemplates.list);
router.post('/mappingTemplate', awsJwtValidator, csvTemplates.save);
router.patch('/mappingTemplate', awsJwtValidator, csvTemplates.save);
router.delete('/mappingTemplate', awsJwtValidator, csvTemplates.remove);

export default router;
