export default {
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
      entityType
      identifier{...idFields}
      hasConceptArt {
        Asset {
          entityType
          identifier{...idFields}
          structuralCharacteristics {
            structuralType
          }
          Asset {
            entityType
            identifier{...idFields}
            name
            description
            structuralCharacteristics {
              structuralType
              identifier {...idFields}
              structuralProperties {
                linkset {
                  referentType
                  mediaType
                }
                fileDetails {
                  filename
                  filepath
                  fileExtension
                }
              }
            }
            functionalCharacteristics {
              functionalType
            }
          }
        }
      }
      appearsIn {
        NarrativeScene {
          entityType
          identifier{...idFields}
          sceneName {
            fullName
            altName
          }
          sceneNumber
          description
          slugline {
            title
            text
          }
        }
      }
      usesProp {
        NarrativeProp {
          entityType
          identifier{...idFields}
        }
      }
      usesWardrobe {
        NarrativeWardrobe {
          entityType
          identifier{...idFields}
          name
          description
        }
      }
    }
  }
}
        `,
    variables: {},
    responsePath: 'allCharacters',
    assetPath: 'Context.hasConceptArt.Asset.Asset',
};
