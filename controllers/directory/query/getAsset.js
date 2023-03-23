module.exports = `
    fragment idFields on Identifier {
      identifierScope
      identifierValue
    }
    query($identifierScope: String, $identifierValue: String){
        getAsset(identifierScope: $identifierScope, identifierValue: $identifierValue) {
        entityType
        identifier {...idFields}
        Context {
          isConceptArtFor {
            Character {
              entityType
              identifier {...idFields}
            }
          }
        }
      }
    }
`;
