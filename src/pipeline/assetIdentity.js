/**
 * Identity for ingested asset files.
 *
 * Identifiers are derived from the file's content, and only this service sees the bytes, so this
 * service mints them. The client sends the OMC unidentified and unlinked.
 *
 * Every OMC fact used here is asked of omc-util — the prefixes, the reference shape, where the
 * edge is stored and whether it has an inverse. Nothing about the schema is restated.
 *
 * @namespace namespace:LabkoatApi.assetIdentity
 */

/**
 * Mint and link the `Asset` / `AssetStructure` pair for one uploaded file.
 *
 * The MD5 is used **verbatim as the identifier body**, with the entity type's own prefix:
 *
 * ```
 * Asset            ast-9e107d9d372bb6826bd81d3542a419d6
 * AssetStructure   asts-9e107d9d372bb6826bd81d3542a419d6
 * ```
 *
 * `idFromValue`, not `idHash`: `idHash` folds the entity type into the hash, which would destroy
 * the property that the hash is readable straight off the identifier. The prefixes are what keep
 * the pair distinct, so nothing trips the import pipeline's rule that no two entities share an
 * identifier.
 *
 * Re-uploading the same bytes reproduces the same identifiers. That is the point: the Portal's
 * staging lookup then finds the entities already in fMam and the import is an update rather than a
 * second copy. There is deliberately no de-duplication logic; identity already carries it.
 *
 * @param {Object} params
 * @param {object} params.asset - The client's unidentified Asset
 * @param {object} params.assetStructure - The client's unidentified AssetStructure
 * @param {string} params.md5 - The uploaded file's content hash
 * @param {string} params.identifierScope - The project's scope
 * @param {string} params.schemaVersion - The project's OMC schema version
 * @param {string} params.storageUrl - Where the bytes landed, recorded on the AssetStructure
 * @returns {Promise<Array<object>>} The identified, linked pair
 */
export default async function mintAssetPair({
    asset, assetStructure, md5, identifierScope, schemaVersion, storageUrl,
}) {
    // Both come from the project's record, so an unreadable or incomplete record lands here. Say
    // which field is missing: without this the failure is `Cannot read properties of undefined
    // (reading 'entityTemplate')` thrown from inside omc-util's template lookup, which says
    // nothing about the project whose configuration is actually at fault.
    const missing = [
        !schemaVersion && 'schemaVersion',
        !identifierScope && 'primaryScope',
    ].filter(Boolean);
    if (missing.length) {
        throw new Error(`cannot mint asset identifiers: the project record has no ${missing.join(' and no ')}`);
    }

    // omc-util is loaded on first use rather than at import time: it compiles the OMC JSON Schemas
    // on import, which costs a second and prints several hundred ajv strict-mode warnings. A
    // gateway that mostly proxies fMam should not pay that at boot.
    const { omcEdges, omcIdentifier } = await import('omc-util');

    const identify = (entity, entityType) => ({
        ...entity,
        schemaVersion,
        entityType,
        identifier: [omcIdentifier.idFromValue({
            identifierScope, value: md5, entityType, prefix: true, schemaVersion,
        })],
    });

    const identifiedAsset = identify(asset ?? {}, 'Asset');
    let identifiedStructure = identify(assetStructure ?? {}, 'AssetStructure');

    // Where the bytes actually live is a fact only this service has.
    if (storageUrl) {
        identifiedStructure = {
            ...identifiedStructure,
            assetStructureProperties: {
                ...identifiedStructure.assetStructureProperties,
                fileDetails: {
                    ...identifiedStructure.assetStructureProperties?.fileDetails,
                    filePath: storageUrl,
                },
            },
        };
    }

    // The pair cannot be linked until both identities exist, because an edge references an
    // identifier. omcEdges decides the path, the storage shape and whether an inverse is written.
    const linked = omcEdges.edgeCreate({
        fromEntity: identifiedAsset,
        toEntity: identifiedStructure,
        inverse: false,
    });

    return linked
        ? [linked.fromEntity, linked.toEntity]
        : [identifiedAsset, identifiedStructure];
}
