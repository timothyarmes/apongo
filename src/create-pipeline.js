const { ApolloError } = require('apollo-server-core');

const { parseResolveInfo, simplifyParsedResolveInfoFragmentWithType } = require('./parse-resolve-info');

function fillPipeline(fields, pipeline, context, path = '') {
  Object.keys(fields).forEach((fieldName) => {
    const field = fields[fieldName];
    const { alias, apongo = {} } = field;
  
    // `lookup` performs a lookup stage
    if (apongo.lookup) {
      let lookup;
      if (!apongo.lookup.conds) {
        lookup = {
          from: apongo.lookup.collection,
          localField: `${path}${apongo.lookup.localField}`,
          foreignField: apongo.lookup.foreignField,
        };
      } else {
        lookup = {
          from: apongo.lookup.collection,
          let: { localField: `$${path}${apongo.lookup.localField}` },
          pipeline: [{
            $match: {
              $expr: {
                $and: [
                  { $eq: [`$${apongo.lookup.foreignField}`, '$$localField'] },
                  ...JSON.parse(apongo.lookup.conds),
                ],
              },
            },
          }],
        };
      }

      const preserveNullAndEmptyArrays = apongo.lookup.preserveNull !== undefined ? apongo.lookup.preserveNull : true;

      pipeline.push({ $lookup: { ...lookup, as: `${path}${alias}` } });
      pipeline.push({ $unwind: { path: `$${path}${alias}`, preserveNullAndEmptyArrays } });
    }

    // `compose` concatenates the arguments passed in.
    // Auguments prefixed by $ are modified to inlude the ancestor path
    if (apongo.compose) {
      pipeline.push({
        $addFields: {
          [`${path}${alias}`]: {
            $ifNull: [
              { $concat: apongo.compose.map((str) => (str.startsWith('$')) ? `$${path}${str.slice(1, str.length)}` : str) },
              '$$REMOVE',
            ],
          }
        }
      });
    }

    // Assigns the result of a mongo expression to the field
    // Occurrences of `@path.` in the argument are replaced with ancestor path.
    if (apongo.expr) {
      const e = JSON.parse(apongo.expr.replace('@path.', path));
      pipeline.push({
        $addFields: {
          [`${path}${alias}`]: { $ifNull: [e, '$$REMOVE'] }
        }
      });
    }

    // If the parent didn't exist at all before compose or expr was called then we'll end up with an empty object.
    // If that's the case then we remove it.
    if ((joiner.lookup || apongo.compose || apongo.expr) && path) {
      const parent = path.slice(0, -1);
      pipeline.push({
        $addFields: {
          [parent]: { $cond: [{ $ne: [`$${parent}`, {}] }, `$${parent}`, '$$REMOVE'] }
        }
      });
    }

    const fieldsByTypeNameKeys = Object.keys(field.fieldsByTypeName);
    if (fieldsByTypeNameKeys.length === 0) return;
    if (fieldsByTypeNameKeys.length > 1) throw new ApolloError(`Unable to handle join return type with multiple types (${fieldsByTypeNameKeys.join(', ')})`);
    const subFields = field.fieldsByTypeName[fieldsByTypeNameKeys[0]];
    fillPipeline(subFields, pipeline, context, `${path}${alias}.`);
  });
}

function createPipeline(mainField, resolveInfo, context) {
  const parsedResolveInfoFragment = parseResolveInfo(resolveInfo);

  let { fields } = simplifyParsedResolveInfoFragmentWithType(
    parsedResolveInfoFragment,
    resolveInfo.returnType,
  );
  
  if (mainField) {
    const field = fields[mainField];
    const fieldsByTypeNameKeys = Object.keys(field.fieldsByTypeName);
    if (fieldsByTypeNameKeys.length === 0) return [];
    if (fieldsByTypeNameKeys.length > 1) throw new ApolloError(`Unable to handle join return type with multiple types (${fieldsByTypeNameKeys.join(', ')})`);
    fields = field.fieldsByTypeName[fieldsByTypeNameKeys[0]];
  }

  const pipeline = [];
  fillPipeline(fields, pipeline, context);

  return pipeline;
}

module.exports = createPipeline;
