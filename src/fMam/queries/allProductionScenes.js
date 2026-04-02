export default {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

{
  allProductionScenes {
    entityType
    identifier {
      ...idFields
    }
    name
    description
    sceneHeader
    sceneNumber
    sceneDescriptor
    Context {
      hasProductionLocation {
        ProductionLocation {
          entityType
          identifier {...idFields}
        }
      }
    }
  }
}
`,
    variables: {},
    responsePath: 'allProductionScenes',
    assetPath: '',
};
