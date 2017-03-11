import express from 'express';
import bodyParser from 'body-parser';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { makeExecutableSchema } from 'graphql-tools';

const typeDefs = [`
type Query {
    hello: String
}

schema {
    query: Query
}`];

const resolvers = {
  Query: {
    hello() {
      return 'world';
    },
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
app.use('/graphql', bodyParser.json(), graphqlExpress({ schema }));
app.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));

export default function() {
  app.listen(4000, () => console.log('Now browse to localhost:4000/graphiql'));
};


import Sequelize from 'sequelize';

const connection = new Sequelize(

);
