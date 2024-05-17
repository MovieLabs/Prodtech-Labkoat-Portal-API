/*

*/

module.exports = async function writeNode(omcNeo4j, driver, database) {
    const { cypher, params } = omcNeo4j;
    try {
        const node = await driver.executeQuery(
            cypher,
            params,
            {
                database,
                bookmarkManager: null,
            },
        );
        return { node };
    } catch (error) {
        return { error };
    }
};
