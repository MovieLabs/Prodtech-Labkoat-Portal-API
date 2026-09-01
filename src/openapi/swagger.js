/**
 * The OpenAPI spec, and the Swagger UI that serves it.
 *
 * The spec is a static `openapi.yaml` beside this file rather than annotations gathered from the
 * routers: the routes are documented in their own JSDoc for somebody reading the code, and a
 * consumer outside this repository needs a file they can fetch, diff and generate a client from.
 *
 * **Parsed once, at import.** A malformed spec should stop the service at boot rather than 404 the
 * first person to open the docs.
 *
 * @module openapi/swagger
 */

import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import swaggerUi from 'swagger-ui-express';
import YAML from 'yaml';

const here = dirname(fileURLToPath(import.meta.url));
const specPath = join(here, 'openapi.yaml');

export const openapiSpec = YAML.parse(readFileSync(specPath, 'utf8'));

export const swaggerSetup = swaggerUi.setup(openapiSpec, {
    customSiteTitle: 'Labkoat API Documentation',
});

export { swaggerUi };
