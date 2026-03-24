/**
 * Log the route and other details
 * @param req
 * @param res
 * @param next
 */

export default function routeLog(req, res, next) {
    console.log(`${req.method}: ${req.path}`);
    next();
}
