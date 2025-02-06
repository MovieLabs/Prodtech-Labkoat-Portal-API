// Create a key value using the scope and value of an identifier
const idKey = ((identifier) => `${identifier.identifierScope}:${identifier.identifierValue}`);

/**
 * Merge the Context of the comparison and original entities, so existing Relationships are not lost
 *
 * Useful prior to comparing large sets of entities prior to comparing, merging or updating them
 *
 * @param item.original
 * @param item.comparison
 * @returns {*[]}
 */

function mergeContext(item) {
    const {
        original,
        comparison,
    } = item;
    if (!original || !comparison) return item; // No original or comparison, so return the item as is
    if (!original?.Context || !comparison.Context) return item; // No context in the original, so return the item as is
    const idMerge = original.Context; // Keep all original Contexts
    // comparison.Context.push({ identifier: [{ identifierScope: 'test', identifierValue: '1234' }] }); // Add a new Context to the comparison
    // idMerge[0].identifier.push({ identifierScope: 'test', identifierValue: '1234' });
    comparison.Context.forEach((cxt1) => {
        const compId = cxt1.identifier.map((id) => idKey(id));
        let match = false;
        idMerge.forEach((cxt2) => {
            cxt2.identifier.forEach((id) => {
                const key = idKey(id);
                if (compId.includes(key)) match = true;
            });
        });
        if (!match) idMerge.push(cxt1);
    });

    comparison.Context = idMerge;
    return item;
}

export default mergeContext;
