import assert from 'node:assert/strict';
import test from 'node:test';

import { GOLDEN_DIR, hashGolden, readManifest } from './golden.js';
import { needsFixtures } from './harness.js';

/**
 * @param {(string|undefined)} actual - The file's checksum now
 * @param {(string|undefined)} recorded - The checksum in the manifest
 * @returns {string} What happened to the file
 */
const drift = (actual, recorded) => {
    if (!recorded) return 'not recorded';
    if (!actual) return 'missing';
    return 'changed';
};

test('the golden bundle is the one recorded', needsFixtures, async () => {
    const [actual, recorded] = await Promise.all([hashGolden(), readManifest()]);
    const changed = [...new Set([...Object.keys(actual), ...Object.keys(recorded)])]
        .filter((name) => actual[name] !== recorded[name])
        .map((name) => `${name}: ${drift(actual[name], recorded[name])}`);

    assert.deepEqual(changed, [], `The golden bundle in ${GOLDEN_DIR} differs from pipelines/test/golden.sha256.json. `
    + 'If it was regenerated on purpose, accept it with `npm run fixtures:record` and commit the manifest.');
});
