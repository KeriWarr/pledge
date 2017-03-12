import express from 'express';
import bodyParser from 'body-parser';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { makeExecutableSchema } from 'graphql-tools';
import Sequelize from 'sequelize';
import {resolver} from 'graphql-sequelize';
import {GraphQLDateTime} from 'graphql-iso-date';


const {DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD} = process.env;

const connection = new Sequelize(DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD, {
  host: 'localhost',
  dialect: 'postgres',
  pool: {
    max: 5,
    min: 0,
    idle: 10000
  },
});

const User = connection.define('user', {
  slackId: {
    type: Sequelize.STRING,
    primaryKey: true,
  }
}, {
  freezeTableName: true // Model tableName will be the same as the model name
});

const typeDefs = [`
scalar DateTime

enum Status {
  UNACCEPTED
  LISTED
  UNCONFIRMED
  ACCEPTED
  REJECTED
  CANCELLED
  EXPIRED
  CLOSED
  COMPLETED
  APPEALED
}

enum Currency {
  CAD
  USD
}

type Offer {
  currency: Currency
  amountInCents: Int
  description: String
}

type Wager {
  maker: User!
  taker: User
  arbiter: User
  outcome: String!
  status: Status!
  makerOffer: Offer!
  takerOffer: Offer!
  expiration: DateTime
  maturation: DateTime
  acceptedAt: DateTime
  acceptedByMakerAt: DateTime
  acceptedByTakerAt: DateTime
  acceptedByArbiterAt: DateTime
  rejectedAt: DateTime
  rejectedBy: User
  cancelledAt: DateTime
  cancelledBy: User
  appealedAt: DateTime
  appealedBy: User
  takenAt: DateTime
  completedAt: DateTime
  closedAt: DateTime
  closedBy: User
  createdAt: DateTime!
  updatedAt: DateTime!
}

enum OperationType {
  ACCEPT
  REJECT
  CANCEL
  TAKE
  CLOSE
  APPEAL
  PROPOSE
}

type Operation {
  type: OperationType!
  user: User!
  createdAt: DateTime!
  updatedAt: DateTime!
  wager: Wager
}

type User {
  slackId: ID!
  createdAt: DateTime!
  updatedAt: DateTime!
  wagers: [Wager]
  operations: [Operation]
}

type Query {
    users: [User!]
}

type Mutation {
  createUser(slackId: String!): User!
}

schema {
    query: Query
    mutation: Mutation
}`];


const resolvers = {
  DateTime: GraphQLDateTime,
  Query: {
    users: resolver(User),
  },
  Mutation: {
    createUser(_, {slackId}) {
      return User.create({
        slackId,
      });
    }
  },
};

const schema = makeExecutableSchema({ typeDefs, resolvers });
const app = express();
app.use('/graphql', bodyParser.json(), graphqlExpress({ schema }));
app.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));


export default function() {
  User.sync({force: true}).then(function () {
    app.listen(4000);
  });
};


// const {CLIENT_ID, CLIENT_SECRET} = process.env,
//       SlackStrategy = require('passport-slack').Strategy,
//       passport = require('passport'),
//       express = require('express'),
//       app = express();
//
// // setup the strategy using defaults
// passport.use(new SlackStrategy({
//     clientID: CLIENT_ID,
//     clientSecret: CLIENT_SECRET,
//     skipUserProfile: true,
//     scope: ['bot', 'chat:write:bot']
//   }, (accessToken, refreshToken, profile, done) => {
//     console.log(accessToken, refreshToken, profile);
//     // optionally persist profile data
//     done(null, profile);
//   }
// ));
//
// app.use(passport.initialize());
// app.use(require('body-parser').urlencoded({ extended: true }));
//
// // path to start the OAuth flow
// app.get('/auth/slack', passport.authorize('slack'));
//
// // OAuth callback url
// app.get('/auth/slack/callback',
//   passport.authorize('slack', { failureRedirect: '/login' }),
//   (req, res) => res.redirect('/')
// );
//
// export default function() {
//   app.listen(4000);
// };
