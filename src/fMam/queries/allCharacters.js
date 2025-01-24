module.exports = {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query {
  allCharacters {
    entityType
    identifier {...idFields}
    characterName {
      scriptName
    }
    name
    description
    profile {
      physicalCharacteristics {
        species
        hairColor
        hairLength
        eyeColor
        height
        weight
      }
      background {
        likes
        dislikes
        habits
        traits
      }
    }
    Context {
      identifier{...idFields}
    }
  }
}
        `,
    variables: {},
    responsePath: 'allCharacters',
    assetPath: 'Context.hasConceptArt.Asset.Asset',
};
