export default {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query ($structuralType: String, $functionalType: String){
    getAssetType(structuralType: $structuralType, functionalType:$functionalType) {
        entityType
        identifier {...idFields}
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
        ...on artwork_storyboard {
\t\t\t\t\taltName
        }
      }
    }
      Asset {
        entityType
        identifier {...idFields}
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
          functionalProperties {
            ...on artwork_storyboard_frame {
              frameName
              cameraFraming
              description
            }
          }
        }
      }
    }
}
`,
    variables: {
        functionalType: 'artwork.storyboard',
    },
    responsePath: 'getAssetType',
    assetPath: 'Asset',
};
