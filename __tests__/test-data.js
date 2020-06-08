export default {
  "users": [
    {
      "_id": "u1",
      "name": "Peter"
    },
    {
      "_id": "u2",
      "name": "John"
    }
  ],

  "tasks": [
    {
      "_id": "t1",
      "userId": "u1",
      "task": "do stuff"
    },
    {
      "_id": "t2",
      "userId": "u2",
      "task": "fix stuff"
    }
  ],

  "subtasks": [
    {
      _id: 'st1',
      taskId: 't1',
      order: 'a',
    },
    {
      _id: 'st2',
      taskId: 't1',
      order: 'd',
    },
    {
      _id: 'st3',
      taskId: 't1',
      order: 'b',
    },

    {
      _id: 'st4',
      taskId: 't2',
      order: 'a',
    },
  ],
};
