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
      }
    }
    Context {
      entityType
      identifier {
        ...idFields
      }
      hasSlate {
        Slate {
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
    variables: {
        "functionalType": "capture"
    },
    responsePath: 'getAssetType',
    assetPath: '',
};
