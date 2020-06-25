import gql from 'graphql-tag';
import mongoose from 'mongoose';
import mongoUnit from 'mongo-unit';

import { apolloServer, User, Task } from './apollo-config';
import testData from './test-data';

const TASKS = gql`
  query {
    tasks {
      _id
      task
      user {
        _id
        name
      }
    }
  }
`;

const PAGINATED_TASKS = gql`
  query {
    paginatedTasks {
      count
      tasks {
        _id
        task
        user { _id name }
        latestSubTask { _id }
      }
    }
  }
`;

const query = apolloServer();

beforeAll((done) => {
  return mongoUnit.start()
    .then(() => {
      mongoose.connect(mongoUnit.getUrl(), { useNewUrlParser: true, useUnifiedTopology: true });
      mongoUnit.load(testData)
      done();
    })
}, 1200000);

afterAll(() => {
  mongoose.disconnect();
  return mongoUnit.stop();
});

describe('lookup', () => {
  it('joins top level requests', async () => {
    const { data: { tasks } } = await query({ query: TASKS });
    const t1 =  tasks.find(({ _id }) => _id === 't1');
    expect(t1.user._id).toEqual("u1")
  })

  it('joins field level requests', async () => {
    const { data, errors } = await query({ query: PAGINATED_TASKS });
    if (errors) console.log(errors);
    const { paginatedTasks } = data;
    const t1 = paginatedTasks.tasks.find(({ _id }) => _id === 't1');
    expect(t1.user._id).toEqual("u1")
  })

  it('handles advanced lookups', async () => {
    const { data, errors } = await query({ query: PAGINATED_TASKS });
    if (errors) console.log(errors);
    const { paginatedTasks } = data;
    const t1 = paginatedTasks.tasks.find(({ _id }) => _id === 't1');
    expect(t1.latestSubTask._id).toEqual("st2")
  })
});
