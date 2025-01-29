/**
 * Express middleware for validating a JWT
 */

import { expressjwt as jwt } from 'express-jwt';
import jwksRsa from 'jwks-rsa';

function jwtValidator({ audience, issuer, jwksUri }) {
    return jwt({
        // Dynamically provide a signing key based on the kid in the header and the signing keys provided by the JWKS endpoint
        secret: jwksRsa.expressJwtSecret({
            cache: true,
            rateLimit: true,
            jwksRequestsPerMinute: 5,
            jwksUri,
        }),

        // Validate the audience and the issuer
        audience,
        issuer,
        algorithms: ['RS256'],
    });
}

export default jwtValidator;
