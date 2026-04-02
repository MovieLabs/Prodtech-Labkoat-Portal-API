export default {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

{
  allCreativeWork {
    entityType
    identifier {
      ...idFields
    }
    title {
      workingTitle
    }
    description
    approximateLength
    originalLanguage
    countryOfOrigin
    Context {
      entityType
      identifier {
        ...idFields
      }
      hasContributor {
        Participant {
          entityType
          identifier {
            ...idFields
          }
          name
          description
        }
      }
      hasProductionCompany {
        Participant {
          entityType
          identifier {
            ...idFields
          }
          name
          description
        }
      }
      hasContributionCharacter {
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
      }
      hasScript {
        Asset {
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
    responsePath: 'allCreativeWork',
    assetPath: '',
};
