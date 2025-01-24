module.exports = {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

{
  allNarrativeScenes {
    entityType
    identifier {
      ...idFields
    }
    sceneName {
      fullName
      altName
    }
    description
    sceneNumber
    slugline {
      title
      text
    }
    Context {
      entityType
      identifier {
        ...idFields
      }
      isFromScript {
        Asset {
          entityType
          identifier {
            ...idFields
          }
          name
          description
          structuralCharacteristics {
            structuralType
            identifier {
              ...idFields
            }
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
      features {
        Character {
          entityType
          identifier {
            ...idFields
          }
          characterName {
            fullName
          }
          description
        }
        NarrativeProp {
          entityType
          identifier {
            ...idFields
          }
        }
        NarrativeSetDressing {
          entityType
          identifier {
            ...idFields
          }
        }
      }
      isFromWork {
        CreativeWork {
          entityType
          identifier {
            ...idFields
          }
          title {
            workingTitle
          }
        }
      }
      hasStoryboard {
        Asset {
          entityType
          identifier {
            ...idFields
          }
        }
      }
      hasNarrativeLocation {
        NarrativeLocation {
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
    responsePath: 'allNarrativeScenes',
    assetPath: '',
};
