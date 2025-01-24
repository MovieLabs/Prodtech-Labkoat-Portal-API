/**
 * Generate and return a UUID
 */

const { nanoid } = require('nanoid');

// Generate ID for an entity (prefix ent:)
function entity(prefix = 'ent') {
    return `${prefix}/${nanoid()}`;
}

// Generate ID for an Asset (prefix ast:)
function asset() {
    return `ast/${nanoid()}`;
}

module.exports = {
    entity,
    asset,
};
