const { SchemaDirectiveVisitor } = require('graphql-tools');
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

class apongoDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    return {
      ...field,
      apongo: this.args,
    };
  }
}

module.exports = {
  apongoTypes,
  apongoDirectives : { apongo: apongoDirective },
};

