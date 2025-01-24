module.exports = {
    query: `
fragment idFields on Identifier {
  identifierScope
  identifierValue
}

query {
    allSlates {
        entityType
        identifier {...idFields}
      slateUID
      cameraLabel
      cameraUnit
      cameraRoll
      soundRoll
      shootDate
      shootDay
      recordingFPS
      Director {
        entityType
        identifier {...idFields}
      }
      Context {
        entityType
        identifier {...idFields}
        isSlateFor {
          ProductionScene {
            entityType
            identifier {...idFields}
          }
        }
      }
    }
} 
`,
    variables: {},
    responsePath: 'allSlates',
    assetPath: '',
};
