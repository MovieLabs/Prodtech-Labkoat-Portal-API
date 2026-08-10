import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import {
    listProjects,
    createProject,
    updateProject,
    removeProject,
    resetProject,
} from '../controllers/admin/projects.js';
import {
    listMappingTemplates,
    saveMappingTemplate,
    removeMappingTemplate,
} from '../controllers/admin/templates.js';

const router = express.Router();

// Every route is authenticated, including the mutations. Only the read used to be: creating,
// editing, resetting and deleting a project were all reachable without a token, and reset and
// delete now destroy stored files as well as database contents.
router.get('/project', awsJwtValidator, listProjects);
router.post('/project', awsJwtValidator, createProject);
router.patch('/project', awsJwtValidator, updateProject);
router.delete('/project', awsJwtValidator, removeProject);
router.delete('/reset', awsJwtValidator, resetProject);

// Mapping templates — how a sheet of source data becomes OMC. Authenticated like everything else
// here: a template is not secret, but it decides what a pipeline writes into a project.
router.get('/mappingTemplate', awsJwtValidator, listMappingTemplates);
router.post('/mappingTemplate', awsJwtValidator, saveMappingTemplate);
router.patch('/mappingTemplate', awsJwtValidator, saveMappingTemplate);
router.delete('/mappingTemplate', awsJwtValidator, removeMappingTemplate);

export default router;
