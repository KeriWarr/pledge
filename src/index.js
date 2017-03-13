import express from 'express';
import bodyParser from 'body-parser';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { makeExecutableSchema } from 'graphql-tools';
import Sequelize from 'sequelize';
import { resolver } from 'graphql-sequelize';
import { GraphQLDateTime } from 'graphql-iso-date';
import cls from 'continuation-local-storage';

const namespace = cls.createNamespace('pledge');


const { DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD } = process.env;

Sequelize.cls = namespace;
const sequelize = new Sequelize(DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD, {
  host: 'localhost',
  dialect: 'postgres',
  pool: {
    max: 5,
    min: 0,
    idle: 10000,
  },
  define: { paranoid: true },
  logging: console.log,
});

const SlackUserRegex = /.*/i;

const User = sequelize.define('user', {
  id: {
    primaryKey: true,
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
  },
  slackId: {
    type: Sequelize.STRING(20),
    alllowNull: false,
    validate: {
      is: SlackUserRegex,
    },
  },
});

const Currencies = [
  'CAD',
  'USD',
];

const Offer = sequelize.define('offer', {
  id: {
    primaryKey: true,
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
  },
  currency: {
    type: Sequelize.ENUM,
    values: Currencies,
  },
  amountInCents: Sequelize.INTEGER,
  description: Sequelize.TEXT,
});

const Statuses = [
  'UNACCEPTED',
  'LISTED',
  'UNCONFIRMED',
  'ACCEPTED',
  'REJECTED',
  'CANCELLED',
  'EXPIRED',
  'CLOSED',
  'COMPLETED',
  'APPEALED',
];

const Wager = sequelize.define('wager', {
  id: {
    primaryKey: true,
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
  },
  intId: {
    type: Sequelize.INTEGER,
    autoIncrement: true,
  },
  outcome: Sequelize.TEXT,
  status: {
    type: Sequelize.ENUM,
    values: Statuses,
    allowNull: false,
  },
  expiration: Sequelize.DATE,
  maturation: Sequelize.DATE,
  acceptedAt: Sequelize.DATE,
  acceptedByMakerAt: Sequelize.DATE,
  acceptedByTakerAt: Sequelize.DATE,
  acceptedByArbiterAt: Sequelize.DATE,
  rejectedAt: Sequelize.DATE,
  cancelledAt: Sequelize.DATE,
  appealedAt: Sequelize.DATE,
  takenAt: Sequelize.DATE,
  completedAt: Sequelize.DATE,
  closedAt: Sequelize.DATE,
});

const OperationTypes = [
  'ACCEPT',
  'REJECT',
  'CANCEL',
  'TAKE',
  'CLOSE',
  'APPEAL',
  'PROPOSE',
];

const Operation = sequelize.define('operation', {
  id: {
    primaryKey: true,
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
  },
  type: {
    type: Sequelize.ENUM,
    values: OperationTypes,
    allowNull: false,
  },
});

Offer.Wager = Offer.hasOne(Wager);
Wager.MakerOffer = Wager.belongsTo(Offer, { as: 'makerOffer' });
Wager.TakerOffer = Wager.belongsTo(Offer, { as: 'takerOffer' });

Wager.Maker = Wager.belongsTo(User, { as: 'maker' });
Wager.Taker = Wager.belongsTo(User, { as: 'taker' });
Wager.Arbiter = Wager.belongsTo(User, { as: 'arbiter' });
Wager.RejectedBy = Wager.belongsTo(User, { as: 'rejectedBy' });
Wager.CancelledBy = Wager.belongsTo(User, { as: 'cancelledBy' });
Wager.AppealedBy = Wager.belongsTo(User, { as: 'appealedBy' });
Wager.ClosedBy = Wager.belongsTo(User, { as: 'closedBy' });
User.Wagers = User.hasMany(Wager, { as: 'wagers' });

Operation.Wager = Operation.belongsTo(Wager);
Wager.Operations = Wager.hasMany(Operation, { as: 'operations' });

Operation.User = Operation.belongsTo(User);
User.Operations = User.hasMany(Operation, { as: 'operations' });


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
  id: ID!
  wager: Wager!
  currency: Currency
  amountInCents: Int
  description: String
}

type Wager {
  id: ID!
  intId: Int
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
  operations: [Operation!]
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
  id: ID!
  type: OperationType!
  user: User!
  createdAt: DateTime!
  updatedAt: DateTime!
  wager: Wager!
}

type User {
  id: ID!
  slackId: ID!
  createdAt: DateTime!
  updatedAt: DateTime!
  wagers: [Wager!]
  operations: [Operation!]
}

type Query {
  users: [User!]
  wagers: [Wager!]
}

type Mutation {
  createOperation(
    slackId: String!
    type: OperationType!
    wagerId: ID
    wagerIntId: Int
  ): Operation
}

schema {
  query: Query
  mutation: Mutation
}`];

const resolvers = {
  DateTime: GraphQLDateTime,
  Query: {
    users: resolver(User),
    wagers: resolver(Wager),
  },
  Wager: {
    maker: resolver(Wager.Maker),
    taker: resolver(Wager.Taker),
    arbiter: resolver(Wager.Arbiter),
    rejectedBy: resolver(Wager.RejectedBy),
    cancelledBy: resolver(Wager.CancelledBy),
    appealedBy: resolver(Wager.AppealedBy),
    closedBy: resolver(Wager.ClosedBy),
    operations: resolver(Wager.Operations),
    makerOffer: resolver(Wager.MakerOffer),
    takerOffer: resolver(Wager.TakerOffer),
  },
  User: {
    wagers: resolver(User.Wagers),
    operations: resolver(User.Operations),
  },
  Operation: {
    user: resolver(Operation.User),
    wager: resolver(Operation.Wager),
  },
  Offer: {
    wager: resolver(Offer.Wager),
  },
  Mutation: {
    createOperation(_, { slackId, type, wagerId, wagerIntId }) {
      if (type === 'PROPOSE' && (wagerId || wagerIntId)) {
        throw new Error('Must not specify an existing wager when proposing');
      } else if (type !== 'PROPOSE' && ((wagerId && wagerIntId) || (!wagerId && !wagerIntId))) {
        throw new Error('Must specify exactly one existing wager when not proposing');
      }

      return sequelize.transaction(() => {
        const userPromise = User.findOrCreate({ where: { slackId } });
        let wagerPromise;
        if (type === 'PROPOSE') {
          wagerPromise = Wager.create({
            outcome: 'foo',
            makerOffer: {
              description: 'bar',
            },
            takerOffer: {
              currency: 'CAD',
              amountInCents: 250,
            },
            status: 'LISTED',
          }, {
            include: [Wager.MakerOffer, Wager.TakerOffer],
          });
        } else if (wagerId) {
          wagerPromise = Wager.findById(wagerId);
        } else {
          wagerPromise = Wager.findOne({ where: { wagerIntId } });
        }
        const operationPromise = Operation.create({ type });

        let savedOperation;
        return Promise.all([userPromise, wagerPromise, operationPromise]).then(
          ([userTuple, wager, operation]) => {
            const user = userTuple[0];
            savedOperation = operation;
            const operationSetUserPromise = operation.setUser(user);
            const operationSetWagerPromise = operation.setWager(wager);
            const wagerSetMakerPromise = wager.setMaker(user);
            const userAddWagerPromise = user.addWager(wager);
            return Promise.all([
              operationSetUserPromise,
              operationSetWagerPromise,
              wagerSetMakerPromise,
              userAddWagerPromise,
            ]);
          },
        ).then(() => savedOperation);
      });
    },
  },
};

const schema = makeExecutableSchema({
  typeDefs,
  resolvers,
});
const app = express();
app.use('/graphql', bodyParser.json(), graphqlExpress({ schema }));
app.use('/graphiql', graphiqlExpress({ endpointURL: '/graphql' }));

export default function () {
  sequelize.sync({ force: true }).then(() => {
    app.listen(4000);
    console.log('listening');
  });
}


// export default function()  {
//   sequelize.sync({force: true, logging: console.log});
// }

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
