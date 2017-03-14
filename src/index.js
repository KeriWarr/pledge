import express from 'express';
import bodyParser from 'body-parser';
import { graphqlExpress, graphiqlExpress } from 'graphql-server-express';
import { makeExecutableSchema } from 'graphql-tools';
import Sequelize from 'sequelize';
import { resolver } from 'graphql-sequelize';
import { GraphQLDateTime } from 'graphql-iso-date';
import cls from 'continuation-local-storage';
import R from 'ramda';
import assert from 'assert';
import { constantCase } from 'change-case';

const namespace = cls.createNamespace('pledge');


const { DATABASE_NAME, DATABASE_USERNAME, DATABASE_PASSWORD } = process.env;

Sequelize.cls = namespace;
const sequelize = new Sequelize(
  DATABASE_NAME,
  DATABASE_USERNAME,
  DATABASE_PASSWORD,
  {
    host: 'localhost',
    dialect: 'postgres',
    pool: {
      max: 5,
      min: 0,
      idle: 10000,
    },
    define: { paranoid: true },
    logging: console.log,
  },
);

const SlackUserRegex = /.*/i;

const extendWithUUID = obj => Object.assign({}, obj, {
  id: {
    primaryKey: true,
    type: Sequelize.UUID,
    defaultValue: Sequelize.UUIDV4,
  },
});

const User = sequelize.define('user', extendWithUUID({
  slackId: {
    type: Sequelize.STRING(20),
    alllowNull: false,
    validate: {
      is: SlackUserRegex,
    },
  },
}));

const Currencies = [
  'CAD',
  'USD',
];

const Offer = sequelize.define('offer', extendWithUUID({
  currency: {
    type: Sequelize.ENUM,
    values: Currencies,
  },
  amountInCents: Sequelize.INTEGER,
  description: Sequelize.TEXT,
}));

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

const Wager = sequelize.define('wager', extendWithUUID({
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
}));

const OperationTypes = [
  'ACCEPT',
  'REJECT',
  'CANCEL',
  'TAKE',
  'CLOSE',
  'APPEAL',
  'PROPOSE',
];

const Operation = sequelize.define('operation', extendWithUUID({
  type: {
    type: Sequelize.ENUM,
    values: OperationTypes,
    allowNull: false,
  },
}));

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

input Offer {
  currency: Currency
  amountInCents: Int
  description: String
}

input WagerParameters {
  taker: String
  arbiter: String
  outcome: String
  makerOffer: Offer
  takerOffer: Offer
  expiration: DateTime
  maturation: DateTime
}

type Mutation {
  createOperation(
    slackId: String!
    type: OperationType!
    wagerId: ID
    wagerIntId: Int
    wagerParameters: WagerParameters
  ): Operation
}

schema {
  query: Query
  mutation: Mutation
}`];


const mapToSelf = list => R.zipObj(list.map(constantCase), list);
const setEquivalent = R.compose(
  R.equals([]),
  R.symmetricDifference,
);
const setSubset = R.compose(
  R.equals([]),
  R.difference,
);

const OPERATION_TYPES = mapToSelf([
  'ACCEPT',
  'REJECT',
  'CANCEL',
  'TAKE',
  'CLOSE',
  'APPEAL',
  'PROPOSE',
]);

const WAGER_PARAMETERS = mapToSelf([
  'taker', 'arbiter', 'outcome', 'makerOffer',
  'takerOffer', 'expiration', 'maturation',
]);

const PARAMETERS = {
  FORBIDDEN: 0,
  OPTIONAL: 1,
  REQUIRED: 2,
};

const operationTypeToWagerParameterMap = {
  [OPERATION_TYPES.ACCEPT]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
  [OPERATION_TYPES.REJECT]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
  [OPERATION_TYPES.CANCEL]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
  [OPERATION_TYPES.TAKE]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
  [OPERATION_TYPES.CLOSE]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
  [OPERATION_TYPES.APPEAL]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
  [OPERATION_TYPES.PROPOSE]: {
    [WAGER_PARAMETERS.TAKER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.ARBITER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.OUTCOME]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.TAKER_OFFER]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.EXPIRATION]: PARAMETERS.FORBIDDEN,
    [WAGER_PARAMETERS.MATURATION]: PARAMETERS.FORBIDDEN,
  },
};

assert(setEquivalent(
  R.keys(OPERATION_TYPES),
  R.keys(operationTypeToWagerParameterMap),
));

R.values(operationTypeToWagerParameterMap).forEach(
  (operationTypeWagerParameters) => {
    assert(setEquivalent(
      R.keys(operationTypeWagerParameters),
      R.keys(WAGER_PARAMETERS),
    ));
    assert(setSubset(
      R.values(operationTypeWagerParameters),
      R.values(PARAMETERS),
    ));
  },
);

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
    createOperation(_, {
      slackId, type, wagerId, wagerIntId,
      wagerParameters: {
        taker, arbiter, outcome, makerOffer,
        takerOffer, expiration, maturation,
      },
    }) {
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
