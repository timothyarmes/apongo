import gql from 'graphql-tag';
import mongoose from 'mongoose';
import mongoUnit from 'mongo-unit';

import { apolloServer, User, Task } from './apollo-config';
import testData from './test-data';
import { chainResolvers } from 'graphql-tools';

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
        user {
          _id
          name
        }
      }
    }
  }
`;

const query = apolloServer();

beforeAll((done) => {
  console.info(
`Starting mongoUnit...
Note that the tests need to download mongodb-prebuilt the first time, and that can take a few minutes.
If you get an error concerning spawning, run 'chmod -R u+x node_modules/mongodb-prebuilt/' and try again.`
  );

  return mongoUnit.start()
    .then(() => {
      console.log('Fake mongo is started');
      mongoose.connect(mongoUnit.getUrl(), { useNewUrlParser: true, useUnifiedTopology: true });
      mongoUnit.load(testData)
      done();
    })
}, 1200000);

afterAll(() => {
  console.log('Stopping mongoUnit...')
  mongoose.disconnect();
  return mongoUnit.stop();
});

describe('lookup', () => {
  it('joins top level requests', async () => {
    const { data: { tasks } } = await query({ query: TASKS });
    const t1 =  tasks.find(({ _id }) => _id === 't1');
    expect(t1.user._id).toEqual("u1")
  })

  it('joins field level requests', async () => {
    const { data: { paginatedTasks } } = await query({ query: PAGINATED_TASKS });
    const t1 = paginatedTasks.tasks.find(({ _id }) => _id === 't1');
    expect(t1.user._id).toEqual("u1")
  })
});
