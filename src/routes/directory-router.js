import express from 'express';

import directoryController from '../controllers/directory/directory.js';
import securityController from '../controllers/directory/securityController.js';

const router = express.Router();

router.get('/directory', directoryController);
router.get('/directory/security', securityController);

export default router;
