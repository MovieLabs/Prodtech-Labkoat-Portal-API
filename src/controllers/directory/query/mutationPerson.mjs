export default {
    query: `
    fragment idFields on Identifier {
      identifierScope
      identifierValue
    }
    
    mutation ($Person: PersonInput) {
      updatePerson(Person: $Person) {
        entityType
        identifier {
          ...idFields
        }
        name
        description
        personName {
          prefix
          firstGivenName
          familyName
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
    }
    `,
    variables: {},
    responsePath: 'Person',
};
