/**
 * Express middleware for validating an AWS Cognito access token.
 *
 * Two different tokens reach this service and they are not shaped alike:
 *
 * - a **machine** token, from a client_credentials grant, carries `client_id` and `scope` but has
 *   no `cognito:groups`;
 * - a **user** token, from the Portal or the GraphiQL login, carries `client_id` and
 *   `cognito:groups` but no `scope` we care about.
 *
 * Neither carries `aud` — that claim only appears on Cognito *id* tokens — so nothing here checks
 * an audience. A verifier is built per accepted shape and they are tried in turn; the first to
 * accept the token wins.
 *
 * @module cognitoValidator
 */

import { CognitoJwtVerifier } from 'aws-jwt-verify';
// eslint-plugin-import has no resolver configured in this repo, so it cannot follow a package
// `exports` subpath. The import itself is valid.
// eslint-disable-next-line import/no-unresolved
import { CognitoJwtInvalidGroupError, JwtInvalidScopeError } from 'aws-jwt-verify/error';

import AuthenticationError from './errors/AuthenticationError.js';
import AuthorizationError from './errors/AuthorizationError.js';

// Allowance for clock drift between this host and Cognito, in seconds.
const GRACE_SECONDS = 60;

/**
 * Pull the bearer token out of the Authorization header.
 *
 * @param {Object} req
 * @returns {string|null} The token, or null if the header is absent or not a bearer scheme
 */
function bearerFrom(req) {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (!token || scheme.toLowerCase() !== 'bearer') return null;
    return token;
}

/**
 * Build the middleware.
 *
 * @param {Object} params
 * @param {string} params.userPoolId - The Cognito user pool, e.g. 'us-west-2_EW6OVSs8M'
 * @param {Object} [params.machine] - Accept service tokens: { clientId, scope }
 * @param {Object} [params.user] - Accept user tokens: { clientId, group }
 * @returns {Function} Express middleware
 */
function cognitoValidator({ userPoolId, machine = null, user = null }) {
    const verifiers = [];

    if (machine) {
        verifiers.push({
            kind: 'machine',
            verifier: CognitoJwtVerifier.create({
                userPoolId,
                tokenUse: 'access',
                clientId: machine.clientId,
                scope: machine.scope,
                graceSeconds: GRACE_SECONDS,
            }),
        });
    }

    if (user) {
        verifiers.push({
            kind: 'user',
            verifier: CognitoJwtVerifier.create({
                userPoolId,
                tokenUse: 'access',
                clientId: user.clientId,
                graceSeconds: GRACE_SECONDS,
            }),
            // Deliberately *not* the verifier's own `groups` option, which demands the exact group
            // name. Group names here are scoped -- `labkoat:admin`, `labkoat:vocab.edit` -- and most
            // members are in one of those and not in bare `labkoat`, so an exact match locks them
            // out. Membership of any scoped group implies membership of the organisation.
            check: (payload) => (payload['cognito:groups'] || [])
                .some((group) => group.includes(user.group)),
        });
    }

    if (verifiers.length === 0) {
        throw new Error('cognitoValidator: configure at least one of machine or user');
    }

    return async function validateCognitoToken(req, res, next) {
        const token = bearerFrom(req);
        if (!token) {
            next(new AuthenticationError('Missing token'));
            return;
        }

        const failures = [];
        let insufficient = false; // Signature verified, but the claims do not carry enough rights
        // Sequential on purpose: the common case matches the first verifier, and verifying against
        // the second costs nothing but a cached-JWKS signature check.
        for (const { kind, verifier, check } of verifiers) {
            try {
                const payload = await verifier.verify(token);
                if (check && !check(payload)) {
                    insufficient = true;
                    continue;
                }
                req.user = payload; // The verified claims, for routes that need to know the caller
                req.tokenKind = kind; // 'machine' or 'user'
                next();
                return;
            } catch (err) {
                failures.push(err);
            }
        }

        // A signature we trust that simply lacks the right group or scope is a 403, not a 401 —
        // the caller proved who it is, it just may not do this.
        const forbidden = insufficient || failures.some((err) => err instanceof CognitoJwtInvalidGroupError
            || err instanceof JwtInvalidScopeError);
        if (forbidden) {
            next(new AuthorizationError('Forbidden'));
            return;
        }

        console.error('Invalid token', failures.map((err) => err.message).join('; '));
        next(new AuthenticationError('Invalid token'));
    };
}

export default cognitoValidator;
