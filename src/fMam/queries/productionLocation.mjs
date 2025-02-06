export default {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query {
\tallProductionLocations {
    entityType
    identifier {...idFields}
    name
    description
    Location {
      entityType
      identifier {...idFields}
      address {
        street
        locality
        region
        postalCode
        country
      }
      coordinates{
        latitude
        longitude
      }
    }
  }
}
        `,
    variables: {},
    responsePath: 'allProductionLocations',
    assetPath: '',
};
