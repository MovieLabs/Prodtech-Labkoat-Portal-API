/**
 * @module
 * @desc A set of useful utility functions
 *
 * @property { function } emptyString - Cleanup string and check if empty
 * @property { function } capitalize - Capitalize first letter of string
 * @property { function } convertNum - Convert a string number (with commas) to number primitive
 * @property { function } makeArray - Ensure value is array if not so already
 * @property {function} hasProp - Safely check if Object has this as own property
 */

/**
 * Trim any whitespace from a string, if the parameter passed in is either not a string
 * or is an empty string, or just has whitespce null will be returned, otherwise a trim string will be returned
 *
 * @param {string} str
 * @returns {(string|null)} - A valid non-empty string or null
 */

const emptyString = (str) => (typeof str !== 'string' || str.trim().length === 0 ? null : str.trim());

/**
 * Capitalize the first letter of the string
 *
 * @param {string} str - String to be capitalized
 * @returns {(string|null)} - String with first letter capitalized or if not a string null is returned
 */

const capitalize = (str) => (typeof str === 'string' ? str.charAt(0).toUpperCase() + str.slice(1) : null);

/**
 * Convert a string to a number, dealing with an comma separators in the string
 *
 * @param {string} str - String to be converted to a number
 * @returns {number} - A string converted to a number primitive
 */

const convertNum = (str) => +str.replace(/,/g, '');

/**
 * Coerces any value into an array, making it iterable, existing arrays are returned as is
 *
 * @param {Object} val - Value to be placed in an array
 * @returns {Array}
 */

const makeArray = (val) => (Array.isArray(val) ? val : [val]);

/**
 * Safely check whether a property exists as one of it's own properties
 *
 * @param {object} obj - The object on which to check the property
 * @param {string} prop - The property name to be checked
 * @returns {boolean}
 */

const hasProp = function hasProp(obj, prop) {
    return Object.prototype.hasOwnProperty.call(obj, prop);
};

/**
 * Test if a variable passed in is an Object or not
 *
 * @param {*} obj  - The variable to be tested
 * @returns {(object|boolean)} - An object if this was passed in or false if not an object
 */

const isObject = (obj) => obj === Object(obj);

/**
 * Recursivelly deep copy an object
 * @param o {object}
 * @returns {{}|*[]|*}
 */

function recursiveDeepCopy(o) {
    let newO;
    let i;

    if (typeof o !== 'object') {
        return o;
    }
    if (!o) {
        return o;
    }

    if (Object.prototype.toString.apply(o) === '[object Array]') {
        newO = [];
        for (i = 0; i < o.length; i += 1) {
            newO[i] = recursiveDeepCopy(o[i]);
        }
        return newO;
    }

    newO = {};
    for (i in o) {
        if (o.hasOwnProperty(i)) {
            newO[i] = recursiveDeepCopy(o[i]);
        }
    }
    return newO;
}

/**
 * An asynchronous queue that limits the concurrency of the number of events at any one time
 * @param concurrency {number} - The maximum number of events at one time
 * @returns {Promise<{push: push}>}
 */

async function asyncQueue(concurrency = 2, qDone = null) {
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

module.exports = {
    emptyString,
    capitalize,
    convertNum,
    makeArray,
    hasProp,
    isObject,
    recursiveDeepCopy,
    asyncQueue,
};
