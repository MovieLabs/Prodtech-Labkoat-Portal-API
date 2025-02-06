export default {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query ($structuralType: String, $functionalType: String) {
  getAssetType(structuralType: $structuralType, functionalType: $functionalType) {
    entityType
    identifier {
      ...idFields
    }
    name
    description
    structuralCharacteristics {
      structuralType
      structuralProperties {
        assetGroup {
          isOrdered
        }
      }
    }
    functionalCharacteristics {
      functionalType
      functionalProperties {
        ... on shot {
          source {
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
                  mediaType
                  recordType
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
          start
          end
          duration
        }
      }
    }
  }
}
`,
    variables: {
        "functionalType": "shot"
    },
    responsePath: 'getAsstetType',
    assetPath: '',
};
