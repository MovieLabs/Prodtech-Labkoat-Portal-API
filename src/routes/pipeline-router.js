import express from 'express';
import { awsJwtValidator } from 'mlHelpers';

import {
    cancelPipelineRun, getPipelineRun, listPipelines, startPipelineRun, uploadPipelineFile,
} from '../controllers/pipeline/pipeline-controller.js';

const router = express.Router();

/**
 * `/api/pipeline/v1` — select a processing pipeline, give it files, get OMC back.
 *
 * See `Labkoat-Portal/src/Components/Omc/Import/Pipeline/CONTRACTS.md` for the wire shapes; the
 * Portal's mock implements them exactly.
 *
 * The upload route bypasses `express.json` because it is `multipart/form-data` — that middleware
 * only claims `application/json`, so the raw stream reaches busboy untouched, which is what lets
 * a multi-gigabyte delivery stream to S3 rather than buffer in memory.
 */
router.get('/catalog', awsJwtValidator, listPipelines);
router.post('/upload', awsJwtValidator, uploadPipelineFile);
router.post('/run', awsJwtValidator, startPipelineRun);
router.get('/run/:runId', awsJwtValidator, getPipelineRun);
router.delete('/run/:runId', awsJwtValidator, cancelPipelineRun);

export default router;
