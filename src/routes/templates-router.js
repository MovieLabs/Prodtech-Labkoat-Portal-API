/**
 * `/api/templates` — saved templates of every kind (CSV mappings, queries, projections), for any
 * signed-in user. POST and PATCH both create or replace: the caller sends the whole template.
 *
 * @module routes/templates-router
 */

import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import { templateHandlers } from '../controllers/templates.js';

const router = express.Router();
const templates = templateHandlers('/template');

router.get('/', awsJwtValidator, templates.list); // List by ?kind=&project=, or fetch one by ?id=
router.post('/', awsJwtValidator, templates.save);
router.patch('/', awsJwtValidator, templates.save);
router.delete('/', awsJwtValidator, templates.remove); // Remove one by ?id=

export default router;
