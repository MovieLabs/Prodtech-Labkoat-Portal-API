module.exports = {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query {
  allNarrativeProps {
    entityType
    identifier {...idFields}
    name
    description
    propType
    Context {
      entityType
      identifier{...idFields}
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
      hasConceptArt {
        Asset {
          entityType
          identifier {...idFields}
          structuralCharacteristics {
            structuralType
            structuralProperties {
              assetGroup {
                isOrdered
              }
            }
          }
          functionalCharacteristics{
            functionalType
          }
            Asset {
            entityType
            identifier {...idFields}
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
            functionalCharacteristics{
              functionalType
            }
          }
        }
      }
      isPropFor {
        Character {
          entityType
          identifier {...idFields}
        }
      }
    }
  }
}
        `,
    variables: {},
    responsePath: 'allNarrativeProps',
    assetPath: '',
};
