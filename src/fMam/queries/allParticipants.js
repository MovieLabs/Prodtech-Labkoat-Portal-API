module.exports = {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query {
  allParticipants {
    entityType
    identifier {
      ...idFields
    }
    name
    description
    Participant {
      entityType
      identifier {...idFields}
    }
    structuralCharacteristics {
      structuralType
      Person {
        entityType
        identifier {...idFields}
        name
        description
        personName {
          firstGivenName
          familyName
          alternateName
        }
        contact {
          email {
            business
          }
          telephone {
            business
          }
        }
        gender {
          gender
          genderPronoun
        }
      }
      Organization {
        entityType
        identifier {...idFields}
        name
        description
        organizationName {
          fullName
          alternateName
        }
      }
    }
    functionalCharacteristics {
      functionalType
      Role {
        entityType
        identifier {...idFields}
        roleType
      }
    }
  }
}

        `,
    variables: {},
    responsePath: 'allParticipants',
    assetPath: 'Context.hasConceptArt.Asset.Asset',
};
