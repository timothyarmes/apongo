const { SchemaDirectiveVisitor } = require('graphql-tools');

class apongoDirective extends SchemaDirectiveVisitor {
  visitFieldDefinition(field) {
    return {
      ...field,
      apongo: this.args,
    };
  }
}

module.exports = apongoDirective;
