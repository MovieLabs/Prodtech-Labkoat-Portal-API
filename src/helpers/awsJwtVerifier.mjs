import config from '../../config.mjs';
import { CognitoJwtVerifier } from 'aws-jwt-verify';

import AuthorizationError from '../errors/AuthorizationError.mjs';

const userPoolId = config.USER_POOL_ID;
const clientId = config.CLIENT_ID;

// Setup the verifier
const verifier = CognitoJwtVerifier.create({
    userPoolId,
    tokenUse: 'access', // or 'id' for ID tokens
    clientId, // Optional, only if you need to verify the token audience
});

export default async function awsJwtVerifier(req, res, next) {
    const token = req.headers.authorization.split(' ')[1];
    try {
        const payload = await verifier.verify(token);
        console.log(payload);
        next();
    } catch (err) {
        console.error('Error verifying JWT:', err);
        next(new AuthorizationError('Error verifying JWT:'));
    }
}
