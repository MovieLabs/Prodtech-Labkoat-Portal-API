/**
 * Returns a single identifierValue for the requested identifierScope from an array of OMC identifiers.
 *
 * OMC entities may have multiple identifiers, this returns the identifierValue for a given scope
 *
 * @module identifierOfScope
 * @param {omcIdentifier[]} identifier - An array of OMC identifiers
 * @param identifierScope {string} - The scope of the required identifierValue
 * @return {string} - A single identifier value
 */
export default function identifierOfScope(identifier, identifierScope) {
    return identifier.filter((id) => id.identifierScope === identifierScope)
        .map((id) => id.identifierValue)[0];
}
