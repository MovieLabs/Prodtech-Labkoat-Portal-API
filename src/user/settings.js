/**
 * Each Portal user's remembered preferences: the current project, split proportions, display
 * options — whatever the Portal's preference store marks as following the reader between machines.
 *
 * **One document per setting, not one per user.** `{ user, project, key, value, modified }`, unique
 * on the first three. Two browsers writing different settings at once therefore cannot overwrite
 * each other, and two writing the same one end with whichever wrote last, which is the agreed rule.
 * It also keeps a setting's key out of the field path: the Portal's keys contain dots
 * (`split.omcGraph`), which Mongo would read as nesting.
 *
 * The service does not know what any setting means. It holds what it is sent, within the limits
 * below, and the Portal decides whether a value it reads back is still usable.
 *
 * The collection lives in the vocabulary's database (`app_config`), the configuration database
 * this service already holds a connection to.
 *
 * @module user/settings
 */

import { ValidationError } from '../vocabulary/store/concurrency.js';
import { vocabDatabase } from '../vocabulary/store/mongoConnection.js';

/** The collection, one document per user, project and setting. */
export const USER_SETTINGS = 'user_settings';

/** The most settings one write may change. */
export const MAX_CHANGES = 200;

/** The longest a key or a project name may be. */
export const MAX_NAME = 256;

/** The largest a single value may be, as JSON. */
export const MAX_VALUE_BYTES = 16 * 1024;

/**
 * Whether a key or project name can be stored as given.
 *
 * @param {*} name
 * @returns {boolean}
 */
const usableName = ((name) => typeof name === 'string' && name.length <= MAX_NAME && !name.startsWith('$'));

/**
 * The changes a write asks for, checked: one `{ project, key, value }` per setting. `project` is
 * `''` for a setting held once rather than per project.
 *
 * @param {object} body - `{ values?: {key: value}, projects?: {project: {key: value}} }`
 * @returns {Array<{project: string, key: string, value: *}>}
 * @throws {ValidationError} With every problem found, not only the first
 */
export function settingChanges(body) {
    const problems = [];
    const changes = [];
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
        throw new ValidationError(['The body must be an object of `values` and `projects`']);
    }

    const take = ((project, entries) => {
        if (!entries || typeof entries !== 'object' || Array.isArray(entries)) {
            problems.push(`The settings for ${project ? `project "${project}"` : 'every project'} must be an object`);
            return;
        }
        Object.entries(entries).forEach(([key, value]) => {
            if (!key || !usableName(key)) {
                problems.push(`"${key}" cannot be a setting's name`);
                return;
            }
            const size = value === undefined ? 0 : Buffer.byteLength(JSON.stringify(value));
            if (value === undefined || size > MAX_VALUE_BYTES) {
                problems.push(`"${key}" ${value === undefined ? 'has no value' : `is ${size} bytes; the most is ${MAX_VALUE_BYTES}`}`);
                return;
            }
            changes.push({ project, key, value });
        });
    });

    if (body.values !== undefined) take('', body.values);
    if (body.projects !== undefined) {
        if (!body.projects || typeof body.projects !== 'object' || Array.isArray(body.projects)) {
            problems.push('`projects` must be an object of projects');
        } else {
            Object.entries(body.projects).forEach(([project, entries]) => {
                if (!project || !usableName(project)) problems.push(`"${project}" cannot be a project's name`);
                else take(project, entries);
            });
        }
    }
    if (changes.length > MAX_CHANGES) problems.push(`${changes.length} settings in one write; the most is ${MAX_CHANGES}`);
    if (problems.length) throw new ValidationError(problems);
    return changes;
}

/**
 * The stored rows for one user, as the shape the Portal keeps them in.
 *
 * @param {Array<{project: string, key: string, value: *}>} rows
 * @returns {{values: object, projects: object}}
 */
export function settingsDocument(rows) {
    return rows.reduce((held, { project, key, value }) => {
        if (!project) return { ...held, values: { ...held.values, [key]: value } };
        return { ...held, projects: { ...held.projects, [project]: { ...held.projects[project], [key]: value } } };
    }, { values: {}, projects: {} });
}

/** The collection's handle. */
const settingsCollection = (() => vocabDatabase().collection(USER_SETTINGS));

/**
 * The index the collection relies on: one row per user, project and setting. Idempotent, so it runs
 * at every boot.
 *
 * @returns {Promise<void>}
 */
export async function createUserSettingsIndexes() {
    await settingsCollection().createIndex({ user: 1, project: 1, key: 1 }, { unique: true });
}

/**
 * Everything one user has stored.
 *
 * @param {string} user - The Cognito `sub`
 * @returns {Promise<{values: object, projects: object}>}
 */
export async function readSettings(user) {
    const rows = await settingsCollection()
        .find({ user }, { projection: { _id: 0, project: 1, key: 1, value: 1 } })
        .toArray();
    return settingsDocument(rows);
}

/**
 * Store what a write asks for. Each setting replaces what was there. A null is stored as a null,
 * not as an absence, so a setting cleared in one browser reads back cleared in the next rather than
 * keeping whatever that browser held.
 *
 * @param {string} user - The Cognito `sub`
 * @param {object} body - As `settingChanges` takes it
 * @returns {Promise<{changed: number}>}
 * @throws {ValidationError}
 */
export async function writeSettings(user, body) {
    const changes = settingChanges(body);
    if (!changes.length) return { changed: 0 };
    const modified = new Date();
    await settingsCollection().bulkWrite(changes.map(({ project, key, value }) => ({
        updateOne: {
            filter: { user, project, key },
            update: { $set: { value, modified } },
            upsert: true,
        },
    })), { ordered: false });
    return { changed: changes.length };
}
