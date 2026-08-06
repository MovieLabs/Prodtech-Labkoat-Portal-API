import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import {
    getProcessingResult, startProcessing, uploadAsset,
} from '../controllers/pipeline/ingest-controller.js';

const router = express.Router();

/**
 * `/api/ingest/v1` — upload files as OMC assets, then mine their contents.
 *
 * See `Labkoat-Portal/src/Components/Omc/Import/Ingest/CONTRACTS.md` for the wire shapes; the
 * Portal's mock implements them exactly, and this router is what replaces it.
 *
 * Kept as its own namespace so the built ingest UI is untouched, but implemented over the same
 * storage, job-store and worker modules as `/api/pipeline/v1`.
 */
router.post('/upload', awsJwtValidator, uploadAsset);
router.post('/process', awsJwtValidator, startProcessing);
router.get('/process/:jobId', awsJwtValidator, getProcessingResult);

export default router;
