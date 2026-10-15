/**
 * Runnable check of what a settings write is turned into, and how stored rows are read back.
 *
 * `node src/user/settings.verify.mjs`
 *
 * The Mongo half is not exercised: it runs every change through these two functions and does
 * nothing else of its own.
 *
 * Throws on failure; prints a summary on success. There is no test runner in this repo.
 */

import {
    MAX_CHANGES, MAX_VALUE_BYTES, settingChanges, settingsDocument,
} from './settings.js';

let checked = 0;

/**
 * @param {string} what
 * @param {*} got
 * @param {*} wanted
 */
function same(what, got, wanted) {
    const a = JSON.stringify(got);
    const b = JSON.stringify(wanted);
    if (a !== b) throw new Error(`${what}\n  got:    ${a}\n  wanted: ${b}`);
    checked += 1;
}

/**
 * The problems a body is refused with, or null when it is accepted.
 *
 * @param {*} body
 * @returns {string[]|null}
 */
function refusal(body) {
    try {
        settingChanges(body);
        return null;
    } catch (err) {
        if (err.name !== 'ValidationError') throw err;
        return err.errors;
    }
}

// ---- accepted ----
same('a setting for every project', settingChanges({ values: { 'split.omcGraph': 0.6 } }), [
    { project: '', key: 'split.omcGraph', value: 0.6 },
]);
same('a setting for one project', settingChanges({ projects: { alpha: { 'merge.setup': { ignoreCase: true } } } }), [
    { project: 'alpha', key: 'merge.setup', value: { ignoreCase: true } },
]);
same('null is a value like any other', settingChanges({ values: { currentProject: null } }), [
    { project: '', key: 'currentProject', value: null },
]);
same('an empty body changes nothing', settingChanges({}), []);

// ---- refused ----
same('not an object', refusal([]), ['The body must be an object of `values` and `projects`']);
same('a name Mongo would read as an operator', refusal({ values: { $set: 1 } }), ['"$set" cannot be a setting\'s name']);
same('a project that is not an object of settings', refusal({ projects: { alpha: 3 } }), ['The settings for project "alpha" must be an object']);
same('a value too large', refusal({ values: { big: 'x'.repeat(MAX_VALUE_BYTES) } }), [
    `"big" is ${MAX_VALUE_BYTES + 2} bytes; the most is ${MAX_VALUE_BYTES}`,
]);
const many = Object.fromEntries(Array.from({ length: MAX_CHANGES + 1 }, (_, at) => [`k${at}`, at]));
same('too many in one write', refusal({ values: many }), [`${MAX_CHANGES + 1} settings in one write; the most is ${MAX_CHANGES}`]);
same('every problem is reported, not only the first', refusal({ values: { $a: 1, $b: 2 } })?.length, 2);

// ---- read back ----
same('rows read back in the shape they were sent', settingsDocument([
    { project: '', key: 'currentProject', value: 'alpha' },
    { project: 'alpha', key: 'import.tab', value: 'merge' },
    { project: 'alpha', key: 'import.dataset', value: 'staging' },
]), {
    values: { currentProject: 'alpha' },
    projects: { alpha: { 'import.tab': 'merge', 'import.dataset': 'staging' } },
});
same('nothing stored', settingsDocument([]), { values: {}, projects: {} });

console.log(`user settings: ${checked} checks passed`);
