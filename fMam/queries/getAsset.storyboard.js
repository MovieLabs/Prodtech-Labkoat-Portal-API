module.exports = {
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
        ... on artwork_storyboard {
          altName
        }
      }
    }
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
        functionalProperties {
          ... on artwork_storyboard_frame {
            frameName
            cameraFraming
            description
          }
        }
      }
    }
    Context {
      isStoryboardFor {
        NarrativeScene {
          entityType
          identifier {...idFields}
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
