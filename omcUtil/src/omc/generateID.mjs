/**
 * Generate a unique identifier value with an optional prefix
 *
 * @module generateId
 * @param {string} [prefix=null] - Optional prefix for the identifier value
 * @returns {string} - A unique identifier value
 */

import { customAlphabet } from 'nanoid';

const omcId = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz1234567890', 10);

export default function generateId(prefix = null) {
    const p = prefix ? `${prefix}-` : '';
    return `${p}${omcId()}`;
}
