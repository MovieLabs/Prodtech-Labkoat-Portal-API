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
      identifier {...idFields}
      structuralProperties {
        assetGroup {
          isOrdered
        }
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
}
        `,
    variables: {},
    responsePath: 'getAssetType',
    assetPath: 'Context.hasConceptArt.Asset.Asset',
};
