module.exports = {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

{
  allNarrativeWardrobes {
    entityType
    identifier {
      ...idFields
    }
    name
    description
    Context {
      hasConceptArt {
        Asset {
          entityType
          identifier {
            ...idFields
          }
        }
      }
    }
  }
}
`,
    variables: {},
    responsePath: 'allNarrativeWardrobe',
    assetPath: '',
};
