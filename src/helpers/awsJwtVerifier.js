import config from '../../config.js';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import AuthenticationError from '../errors/AuthenticationError.js';
import AuthorizationError from '../errors/AuthorizationError.js';

const userPoolId = config.USER_POOL_ID;
const clientId = config.CLIENT_ID;

// Returns true if the user is in at least one group belonging to 'labkoat'
const isInLabkoat = ((groups) => groups.find((grp) => grp.includes('labkoat')));

// Setup the verifier
const verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'access', // or 'id' for ID tokens
    clientId, // Optional, only if you need to verify the token audience
});

export default async function awsJwtVerifier(req, res, next) {
    const bearerToken = req.headers.authorization || '';
    const token = bearerToken.split(' ')[1] || null;
    if (!token) {
        next(new AuthenticationError('Missing token'));
        return;
    }

    try {
        const payload = await verifier.verify(token);
        // User must be in the labkoat group to have access
        const groups = payload['cognito:groups'] || []
        const inLabkoat = isInLabkoat(groups);
        if (!inLabkoat) next(new AuthorizationError('Forbidden'));
        next();
    } catch (err) {
        console.error('Invalid token', err);
        next(new AuthenticationError('Invalid token'));
    }
}
