import { mapSchema, getDirective, MapperKind } from '@graphql-tools/utils';
const gql = require('graphql-tag');

const apongoTypes = gql`
  input ApongoLookup {
    collection: String!
    localField: String!
    foreignField: String!
    preserveNull: Boolean
    conds: String
    sort: String
    limit: Int
  }

  directive @apongo(lookup: ApongoLookup, compose: [String!], expr: String) on FIELD_DEFINITION
`;

function apongoDirective(directiveName = 'apongo') {
  return {
    apongoDirectiveTypeDefs: `
      input ApongoLookup {
        collection: String!
        localField: String!
        foreignField: String!
        preserveNull: Boolean
        conds: String
        sort: String
        limit: Int
      }
    
      directive @${directiveName}(lookup: ApongoLookup, compose: [String!], expr: String) on FIELD_DEFINITION
    `,

    apongoDirectiveTransformer: (schema) => mapSchema(schema, {
      [MapperKind.OBJECT_FIELD]: (fieldConfig, _fieldName, typeName) => {
        const apongoDirective = getDirective(schema, fieldConfig, 'apongo')?.[0];
        if (apongoDirective) {
          fieldConfig.astNode.apongo = apongoDirective;
        }
        return fieldConfig;
      }
    })
  }
}

module.exports = {
  apongoDirective,
};

