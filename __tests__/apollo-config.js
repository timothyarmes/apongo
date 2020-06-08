import { createTestClient } from 'apollo-server-testing';
import { mergeTypes } from 'merge-graphql-schemas';
import { ApolloServer } from 'apollo-server';
import gql from 'graphql-tag';
import mongoose from 'mongoose';

import { apongoTypes, apongoDirectives } from '../src/types';
import createPipeline from '../src/create-pipeline';

const userSchema = new mongoose.Schema({
  name: String,
})

const taskSchema = new mongoose.Schema({
  userId: String,
  task: String,
})

export const User = mongoose.model('user', userSchema);
export const Task = mongoose.model('task', taskSchema);
export const SubTask = mongoose.model('subtask', taskSchema);

const sortSubTasks = JSON.stringify({ order: -1 }).replace(/"/g, '\\"');

const types = gql`
  type User {
    _id: String
    name: String
  }

  type Task {
    _id: String
    task: String
    user: User @apongo(lookup: { collection: "users", localField: "userId", foreignField: "_id" })
    latestSubTask: SubTask @apongo(lookup: { collection: "subtasks", localField: "_id", foreignField: "taskId", sort: "${sortSubTasks}", limit: 1 })
  }

  type SubTask {
    _id: String
    order: String
  }

  type PaginatedTasks {
    tasks: [Task!]!
    count: Int
  }

  type Query {
    tasks: [Task!]!
    paginatedTasks: PaginatedTasks!
  }
`;

const resolvers = {
  Query: {
    tasks: (_, args, context, resolveInfo) => {
      const pipeline = createPipeline(null, resolveInfo, context);
      return Task.aggregate(pipeline)
    },

    paginatedTasks: async (_, args, context, resolveInfo) => {
      const pipeline = [
        ...createPipeline('tasks', resolveInfo, context),
        {
          $facet: {
            tasks: [{ $limit: 10 }],
            count: [
              { $group: { _id: null, count: { $sum: 1 } } },
            ],
          },
        },
      ];

      // console.log(JSON.stringify(pipeline, null, 2))

      return Task.aggregate(pipeline).exec().then(([{tasks, count}]) => {
        return { tasks, count: count.length === 0 ? 0 : count[0].count };
      });
    },
  }
}

export const apolloServer = () => {
  const server = new ApolloServer({
    resolvers,
    typeDefs: mergeTypes([apongoTypes, types]),
    schemaDirectives: { ...apongoDirectives }
  });

  const { query } = createTestClient(server);
  return query;
};
