module.exports = {
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
    AssetSC{
      structuralType
      structuralProperties {
        assetGroup {
          isOrdered
        }
      }
    }
    AssetFC {
      functionalType
    }
      Asset {
        entityType
        identifier {...idFields}
        name
        description
        AssetSC {
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
        AssetFC {
          functionalType
        }

      }
      Context {
        entityType
        identifier {...idFields}
        isConceptArtFor {
          Character {
            entityType
            identifier {...idFields}
          }
          NarrativeProp {
            entityType
            identifier { ...idFields}
          }
        }
      }
    }
}            
`,
    variables: {
        functionalType: 'concept',
    },
    responsePath: 'getAssetType',
    assetPath: 'Asset',
};
