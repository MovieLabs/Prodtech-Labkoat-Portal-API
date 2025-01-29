/**
 * A set of methods for transforming and manipulating OMC-JSON
 *
 * @module omcTransform
 */

// Normalize primitives into strings for output;
const normalizeItem = ((item) => (
    typeof item === 'string' || typeof item === 'number' || typeof item === 'boolean')
    ? item
    : JSON.stringify(item));

// Check if an object is a plain object
const isPlainObject = (obj) => obj && typeof obj === 'object' && obj.constructor === Object;

/**
 * Compare two arrays and return differences, without regard to order
 * @param arr1 {array} - The left-hand side array being compared to
 * @param arr2 {array} - The right-hand side array being compared
 */

function compareArrays(arr1, arr2) {
    const lhs = arr1.map((item) => normalizeItem(item));
    const rhs = arr2.map((item) => normalizeItem(item));
    const diff = {
        $create: [],
        $remove: [],
    };
    arr1.forEach((item) => {
        if (!rhs.includes(normalizeItem(item))) {
            diff.$remove.push(item);
        } else {
            rhs.splice(rhs.indexOf(normalizeItem(item)), 1);
        }
    });
    arr2.forEach((item) => {
        if (!lhs.includes(normalizeItem(item))) {
            diff.$create.push(item);
            rhs.splice(rhs.indexOf(normalizeItem(item)), 1);
        } else {
            lhs.splice(lhs.indexOf(normalizeItem(item)), 1);
        }
    });
    return diff;
}

/**
 * Compare the keys of two OMC-JSON objects without regard to order
 * @param lhs {object} - The left-hand side, object being compared to
 * @param rhs {object} - The right-hand side, object being compared
 */

function compareKeys(lhs, rhs) {
    const lhsKeys = Object.keys(lhs);
    const rhsKeys = Object.keys(rhs);
    const keyDiff = compareArrays(lhsKeys, rhsKeys);

    // Create the diff object showing the added and removed keys and values
    const diff = {};
    keyDiff.$create.forEach((key) => {
        diff[key] = {
            $create: rhs[key],
        };
    });
    keyDiff.$remove.forEach((key) => {
        diff[key] = {
            $remove: lhs[key],
        };
    });

    return diff;
}

/**
 * Compare the values for each key of two objects
 * @param lhs
 * @param rhs
 * @returns {{}}
 */

function compareValues(lhs, rhs) {
    const diff = {};
    Object.keys(lhs)
        .forEach((key) => {
            // Check if the key exists in the right-hand side and the value is a string or number
            if (rhs[key] && (typeof lhs[key] === 'string' || typeof lhs[key] === 'number')) {
                if (lhs[key] !== rhs[key]) {
                    diff[key] = {
                        $update: rhs[key],
                    };
                }
            }

            // Check values in arrays, without regard to order
            if (rhs[key] && Array.isArray(lhs[key]) && Array.isArray(rhs[key])) {
                const arrayDiff = compareArrays(lhs[key], rhs[key]);
                if (arrayDiff.$create.length || arrayDiff.$remove.length) {
                    diff[key] = arrayDiff;
                }
            }

            // Check values in complex objects, without regard key order
            if (rhs[key] && isPlainObject(lhs[key]) && isPlainObject(rhs[key])) {
                const keyDiff = compareKeys(lhs[key], rhs[key]); // Check for addition or deletion of keys
                const propertyDiff = compareValues(lhs[key], rhs[key]); // Check for changes in values
                const changes = { ...keyDiff, ...propertyDiff };
                if (Object.keys(changes).length) diff[key] = changes;
            }
        });
    return diff;
}

/**
 * Compare two OMC-JSON objects and return the differences
 *
 * @function compare
 * @param {OMC-JSON} original - The source OMC-JSON entity
 * @param {OMC-JSON} comparison - The OMC-JSON entity to compareOMC
 * @return {object}
 */

export default function compareOMC({ original, comparison }) {
    // If any of the entities is missing, then do not compare
    if (!original || !comparison) return { original, comparison, diff: null };

    const keyDiff = compareKeys(original, comparison); // Check for addition or deletion of keys
    const propertyDiff = compareValues(original, comparison); // Check for changes in values
    const diff = { ...keyDiff, ...propertyDiff };
    return {
        original,
        comparison,
        diff: Object.keys(diff).length ? diff : null, // Return null if there are no differences
    };
}
