/**
 * A collection of utility functions commonly used across projects
 *
 * @module util
 */

/**
 * Trim whitespace from a string
 * If the value passed in is either not a string or an empty string after being trimmed, null will be returned
 *
 * @function emptyString
 * @param {string} value - The string to be checked and trimmed
 * @returns {(string|null)} A valid non-empty string or null
 */

export const emptyString = (value) => (typeof value !== 'string' || value.trim().length === 0 ? null : value.trim());

/**
 * Capitalize the first letter of the string
 *
 * @function capitalize
 * @param {string} value - String to be capitalized
 * @returns {(string|null)} String with first letter capitalized or if not a string null is returned
 */

export const capitalize = (value) => (typeof value === 'string' ? value.charAt(0).toUpperCase() + value.slice(1) : null);

/**
 * Convert a string to a number, handles any comma separators in the string
 *
 * @function convertNum
 * @param {string} value - String to be converted to a number
 * @returns {number} A string converted to a number primitive
 */

export const convertNum = (value) => +value.replace(/,/g, '');

/**
 * Coerces a value into an Array if it is not already an Array, makes the value iterable
 *
 * @function makeArray
 * @param {*} value - Value to be placed in an array
 * @returns {Array}
 */

export const makeArray = (value) => (Array.isArray(value) ? value : [value]);

/**
 * Test if a value is a Javascript plain Object
 *
 * @function isPlainObject
 * @param {*} value  - The value to be tested
 * @returns {boolean} True if a plain Object was passed, false for other types of Objects and primitives
 */

export const isPlainObject = ((value) => typeof value === 'object'
    && value !== null
    && !Array.isArray(value)
    && !(value instanceof Function));

/**
 * Tests if a string is capitalized
 *
 * @function isCapitalized
 * @param {*} value - The string to be tested
 * @returns {boolean} True if the value is a string and the first letter is capitalized, false otherwise
 */

export const isCapitalized = (value) => typeof value === 'string' && value.length > 0 && /^[A-Z]/.test(value);

/**
 * Spreads an object into another deeply, recursing down the object only overwriting keys in the object being spread
 *
 * @function deepSpread
 * @param {Object} obj - The target object in which to spread properties
 * @param {Object} spread - The object to be spread into obj, only the specific properties are spread into the target object
 * @returns {Object} A new Object with the combined properties
 */

export function deepSpread(obj, spread) {
    return Object.keys(spread).reduce((acc, key) => (
        isPlainObject(spread[key])
            ? { ...acc, [key]: (acc[key] ? deepSpread(acc[key], spread[key]) : spread[key]) }
            : { ...acc, [key]: spread[key] }), obj);
}

/**
 * Recursively deep copy an object
 *
 * @function recursiveDeepCopy
 * @param {Object|Array<Object>} obj
 * @returns {*}
 */

export function recursiveDeepCopy(obj) {
    let newO;
    let i;

    if (typeof obj !== 'object') {
        return obj;
    }
    if (!obj) {
        return obj;
    }

    if (Object.prototype.toString.apply(obj) === '[object Array]') {
        newO = [];
        for (i = 0; i < obj.length; i += 1) {
            newO[i] = recursiveDeepCopy(obj[i]);
        }
        return newO;
    }

    newO = {};
    for (i in obj) {
        if (Object.hasOwn(obj, i)) {
            newO[i] = recursiveDeepCopy(obj[i]);
        }
    }
    return newO;
}

/**
 * An asynchronous queue that limits the concurrency of the number of events at any one time
 *
 * @function asyncQueue
 * @param {number} concurrency  - The maximum number of events at one time
 * @param {function} qDone - Callback when queue has emptied
 * @returns {Promise<{push: push}>}
 */

export async function asyncQueue(concurrency = 2, qDone = null) {
    let running = 0;
    const taskQueue = [];

    const runTask = async () => {
        if (taskQueue.length !== 0) {
            running += 1;
            const task = taskQueue.shift(); // Pop the next task off the list
            await task();
            // await func; // Wait for the task to complete
            running -= 1;
            return runTask(); // Move to the next task in the list
        }
        if (qDone !== null && running === 0) qDone(); // Callback when queue is empty
        return false;
    };

    return {
        push: (task) => {
            const tasks = makeArray(task);
            taskQueue.push(...tasks);
            while (taskQueue.length > 0 && running < concurrency) runTask();
        },
    };
}
