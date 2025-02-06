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
    AssetSC {
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
    AssetFC {
      functionalType
    }
    Asset {
      entityType
      identifier {
        ...idFields
      }
      name
      description
      AssetSC {
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
      AssetFC {
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
