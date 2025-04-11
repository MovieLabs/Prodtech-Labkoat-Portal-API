import test, { describe, it } from 'node:test';
import * as assert from 'node:assert';

import { compare } from '../index.mjs';

import { char1, char2 } from './examples/Char.mjs';

describe('Object Keys are the same', () => {
    it('should return true', () => {
        const keysEqual = compare(char1, char2);
        assert.strictEqual(keysEqual, true);
    });
});

console.log();
