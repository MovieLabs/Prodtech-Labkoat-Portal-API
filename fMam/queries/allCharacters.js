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
      entityType
      identifier{...idFields}
      hasConceptArt {
        Asset {
          entityType
          identifier{...idFields}
          structuralCharacteristics {
            structuralType
            structuralProperties {
              assetGroup {
                isOrdered
              }
            }
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
                  recordType
                  mediaType
                }
                fileDetails {
                  fileName
                  filePath
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
          name
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
      hasProp {
        NarrativeProp {
          entityType
          identifier{...idFields}
          name
          description
        }
      }
      hasWardrobe {
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
