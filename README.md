# Apongo

Create Mongo aggregation pipelines with collection joins (using `$lookup`) for Apollo queries.

## Overview

A typical Apollo/Mongo based project will use individual GraphQL resolvers to recursively fetch fields from Mongo collections.
This approach is often sufficient, however it suffers from two major problems:

1. The recursive nature of GraphQL means that a single request can lead to many database requests.
   For example, if a request pulls in 100 results, and each of those results calls a resolver that
   requires a further lookup in other collection, then that single query will result in 101 database fetches.
   It's easy to see how we can quickly reach hundreds of lookups for a single Apollo query.

2. The second problem, and the most difficult one to solve, occurs when we need to fetch data from a
   primary collection, join with a secondary collection and then sort (or filter) the results based on a
   field in that *second* collection.
   
   A typical scenario would occur when fetching data from multiple collections to display in a table where
   the user can click a column to change the sort order.  In this case it's not sufficient to perform a simple
   Mongo `find` on the top-level collection (since the sub-fields won't be available to sort on), and as a
   result just isn't possible to use the simplified GraphQL approach of fetching the joins using resolvers.

Both of these issues can be solved by performing a *single* Mongo aggregation that fetches all the data in one go,
performing lookups on the related collections, so that we can then sort or filter on any field in the result.

*Apongo* does all the heavy lifting for you:

1. It analyses the `resolveInfo` data passed to the top-level resolver in order to extract the hierarchy of
   fields that have been requested. It does this to ensure that it only performs the joins required for the
   actual query.

2. From this information it builds a __single__ Mongo aggregation pipeline that recursively performs lookups
   for the other collections used in the request.

   You can then include the pipeline as part of a larger aggregation pipeline that sorts and filters the result.

## Installation

```
npm install apongo
```

You'll also need to include Apongo's types and directive in `typeDefs` and `schemaDirectives`
when calling Apollo's `makeExecutableSchema`:

```
import { mergeTypes } from 'merge-graphql-schemas';
import { apongoDirectives, apongoTypes } from 'apongo';

...

const schema = makeExecutableSchema({
  typeDefs: mergeTypes([apongoTypes, ...yourTypes]),
  resolvers,
  schemaDirectives: { ...apongoDirectives },
});
```

## Specifying the Joins

Apongo needs to know which fields are joins, and how to join them. In order to make this both easy to specify and declarative,
a custom GraphQL directive, `@apongo`, is used to specify this information directly in the types declaration. Here's an example:

```
type User {
  ...
  company: Company @apongo(lookup: { collection: "companies", localField: "companyId", foreignField: "_id" })
}

type Query {
  ...
  users: [User!]!
}
```

## Writing the Resolvers

In your resolvers you'll call `createPipeline` to create the aggregation pipeline:

```
import { createPipeline } from 'apongo';

...

const users = (_, { limit = 20 }, context, resolveInfo) => {
  // Create a pipeline to first perform any initial matching, then do the lookups and finally fetch the results
  const pipeline = [
    // Perform any initial matching that you need.
    // This would typically depend on the parameters passed to the query.
    { $match: { type: 'client' } }
    
    // Include all the pipeline stages generated by Apongo to do the lookups
    // We pass `null` since the `users` query is mapped directly to the result
    // of an aggregation on the Users collection.
    ...createPipeline(null, resolveInfo, context),
    
    // Filter, sort or limit the result.
    { $limit: limit },
  ];

  // How you call Mongo will depend on your code base. You'll need to pass your pipeline to Mongo's aggregate.
  // This is how you'd do it using `mongoose`
  return UsersCollection.aggregate(pipeline);
});

```

## API

### createPipeline

`createPipeline` is called with three parameters:

| Parameter       | Description
| --------------- | -----------
| _mainFieldName_ | The name of the field containing the result of the aggregation, or `null` if the entire query is the result of an aggregation over a specific collection. See below.
| _resolveInfo_   | The `resolveInfo` passed to your resolver
| _context_       | The `context` passed to your resolver

This function will analyse the query and construct an aggregation pipeline to construct the lookups.

In the example above, the `users` query needs to directly returns the result of an aggregation over the `Users` collection.
If the GraphQL request includes the `company` field then Apongo will fetch data from the `Companies` collection using `$lookup`.


```
    [
      {
        '$lookup': {
          from: 'companies',
          localField: 'companyId',  // companyId comes from the Users document
          foreignField: '_id',
          as: 'user'
        }
      },
      { '$unwind': { path: '$user', preserveNullAndEmptyArrays: true } }
    ]
```

By default `createPipeline` assumes that the fields in current GraphQL request map directly to the collection that you're aggregating. However, this may not be the case. Take this example:

```
  type PaginatedUsers {
    users: [User!]!
    count: Int
  }

  type Query {
    paginatedUsers: PaginatedUsers!
  }
```

Here, the `paginatedUsers` resolver should return two fields, `count` and `users`. `users` needs be the result an aggregation
on the `Users` collection, so we need to tell `createPipeline` this by passing the field name to `createPipeline`:


```
// Pass 'users' as the field returning data from the Users collection...
const pipeline = createPipeline('users', resolveInfo, context)

// ...then aggregate over the Users collection
return UsersCollection.aggregate(pipeline);
```

See below for more information about handling pagination.

## The @apongo directive

### The *lookup* request

The `lookup` request accepts a number of fields:

| Parameter                   | Description
| --------------------------- | -----------
| _collection_                | The name of the collection to lookup
| _localField_                | The name of the local field used by the $lookup
| _foreignField_              | The name of foreign field used by the $lookup
| _preserveIfNull_ (Optional) | Boolean to determine if the parent should should be kept if no join is found (default - `true`)
| _conds_ (Optional)          | A *stringified* JSON array of additional conditions used by the lookup
| _sort_ (Optional)           | A *stringified* JSON object of sort conditions used by the lookup
| _limit_ (Optional)          | Limit the results returned by the lookup (in the even that there is more than one)


Sometimes your lookup will need extra conditions to perform the join between the two collections. Mongo's `$lookup`
command has an advanced feature that allows us to use a sub-pipeline within the primary lookup. Apongo uses this feature to
allow us to supply an array of extra conditions that are used when matching the collection.

Internally, this is what get added to the sub-pipeline within the `$lookup`:

```
and: [
   { $eq: [`$${foreignField}`, '$$localField'] }, // Match on the keys
   ...JSON.parse(apongo.lookup.conds),            // Extra conditions specified in the directive
],
```

The `conds` needs to be a JSON array, but we have to stringify it in order to pass it to the directive in the types file.

Here's an example:

```
const isLimitedCompanyConds = JSON.stringify([{ $eq: ['$type', 'LIMITED'] }]).replace(/"/g, '\\"');

const types = gql`
   type User {
     ...
     limitedCompany: Company @apongo(lookup: { collection: "companies", localField: "companyId", foreignField: "_id", conds: "${isLimitedConds}" })
   }
`;
```

Similarly, `sort` should be a stringified object.  Using sort and limit we can simulate a `findOne` when joining one item from another collection.

```
const sortSubTasks = JSON.stringify({ order: -1 }).replace(/"/g, '\\"');

type Task {
  _id: String
  latestSubTask: SubTask @apongo(lookup: { collection: "subtasks", localField: "_id", foreignField: "taskId", sort: "${sortSubTasks}", limit: 1 })
}
```

### The *compose* request

Apongo also provides a compose request for performing basic string composition between fields:

```
type User {
  ...
  name: String @apongo(compose: ["$profile.lastName", " ", "$profile.firstName"])
}
```

This is useful when you need to sort or filter on a composed field as part of your pipeline.

Note that Apongo takes care of replacing fields accessed by $ with the full path to that field following any lookups.

### The *expr* request

This is an advanced and very rarely used feature that allows you to use the result of a Mongo aggregation expression
as the value of your field:

```
const firstEmail = JSON.stringify(
  { $arrayElemAt: [{ $map: { input: '$@path.emails', in: '$$this.address' } }, 0] },
).replace(/"/g, '\\"');


const types = gql`
   type User {
     ...
     email: String @apongo(expr: "${firstEmail}")
   }
`;
```

Wherever you need to access a field using $ you should include the token `@path`. Apongo will replace occurrences of
`@path` with the path, allowing for previous joins.


## Development Considerations

1. Remember that the directives are only used by resolvers that call `createPipeline` to create an
   aggregation pipeline. They are ignored by all other resolvers.

2. It's very important to understand that resolvers are __always__ called, even for fields which have already
   been fetched by `createPipeline`. In our example above, if we provide a `company` resolver for the User type
   then it will be called for each fetched user, even though it would have already been fetched by the aggregation.

   It would be very costly to allow the server to refetch all of these fields unnecessarily, so the resolvers
   need to be written to only fetch the field if it doesn't already exist in the root object that's passed to the
   resolver.
   
   Our User resolver might look like this:

   ```
   const User = {
     // We only fetch fields that haven't been fetched by createPipeline.
     // companyId comes from the database collection, company is the result fetched via the pipeline
     company: ({ companyId, company }) => company || CompaniesCollection.findOne(companyId),
     ...
   ```

   In the above example we simply test if `company` has already been fetched into the root object
   (via the `$lookup` stage created by Apongo), and if it hasn't we perform the lookup in the traditional way.

   There's a slight performance limitation that occurs if the $lookup returns a null value.
   In that case the resolver receives `null` for that field, and it can't know that an attempt
   was made to do the join. In this case we'll have to __unnecessarily__ call the database (which will again return `null`).
   Such is life.

## Recipes

### Pagination

Displaying a table of paginated data across multiple collections is likely to be one of the major uses for Apongo.
Typically when displaying paginated data we need to supply the Apollo client with both the data to display,
and also the total number of results so that the total number of pages can be displayed on the UI.

By enhancing the aggregation pipeline we can do this quite easily. The types might look like this:

```
  type PaginatedUsers {
    users: [User!]!
    count: Int
  }

  type Query {
    paginatedUsers: PaginatedUsers!
  }
```

And the resolver:

```
const paginatedUsers = (_, { limit = 20, offset = 0 }, context, resolveInfo) => {
  // Create a main pipeline to first perform the match and lookups
  const pipeline = [
    // Perform any initial matching that you need
    { $match: { type: 'client' } }
    
    // The `users` field contains the result of aggregating over the `Users` collection.
    ...createPipeline('users', resolveInfo, context),
  ];

  // Create a separate pagination pipeline that will sort, skip and limit the results
  const pageSize = Math.min(limit, MAX_PAGE_SIZE);
  const paginatedPipeline = [
    { $sort: [{ id: 'name', desc: 1 }] },
    { $skip: offset },
    { $limit: pageSize },
  ];

  // Split the main pipeline into two facets, one to return the paginated result using the pipeline
  // above, and the other to get the total count of matched documents.
  pipeline.push(
    {
      $facet: {
        users: paginatedPipeline,
        count: [
          { $group: { _id: null, count: { $sum: 1 } } },
        ],
      },
    },
  );

  // Call the aggregation function. Here's how we could do that using mongoose.
  return UsersCollection.aggregate(pipeline).exec().then(([{users, count}]) => {
    return { tasks, count: count.length === 0 ? 0 : count[0].count };
  });
});
```

## FAQ

### Will this work with Meteor?

Yes! Meteor doesn't natively provide access to Mongo's aggregation command. Fortunately this oversight can be
rectified with a this [tiny meteor package](https://github.com/meteorhacks/meteor-aggregate).
