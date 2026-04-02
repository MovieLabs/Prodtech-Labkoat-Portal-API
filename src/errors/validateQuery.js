/**
 * Validate the query parameters
 *
 * @param query
 * @param qv
 * @returns {{}|boolean}
 */
export default function queryValidator(query, qv) {
    const queryError = {};
    for (const key in qv) {
        if (!query[key] && qv[key].required) {
            queryError[key] = `missing: ${key}`;
        }
    }
    if (Object.keys(queryError).length === 0) return false; // No errors
    return Object.values(queryError).join(', ');
}
