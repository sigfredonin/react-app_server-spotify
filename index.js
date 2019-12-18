const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const keys = require('./config/keys');
const search = require("./spotify/search");

const DEBUG = true;

// LOGGED IN USERS CACHE

let loggedInUsers = {}; // { <id>: { user: <data from login> } }

function verifyAuthenticated(req, res, next) {
  const id = req.session && req.session.passport && req.session.passport.user && req.session.passport.user.id;
  console.log(`Is user authenticated? id=${id}`);
  if (loggedInUsers[id]) {
    console.log("User is authenticated.");
      return next();
  };
  console.log('User is NOT authenticated.');
  req.flash('error_msg', 'Please log in to view this resource.');
  res.status(401);
  res.send({errors: ['User not logged in.']});
}

// MONGO DB

// MongoDB config
const db = keys.mongo.dbURI;
mongoose.connect(db, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("MongoDB connected."))
  .catch(err => console.log(err));

// MongoDB Spotify User model
const SpotifyUser = require('./models/spotifyUser');

// PASSPORT

// Spotify Strategy
passport.use(
  new SpotifyStrategy({
    // options for spotify user
    callbackURL: "/users/spotify/redirect",
    clientID: keys.spotify.clientID,
    clientSecret: keys.spotify.clientSecret
  },
  // passport callback function
  (accessToken, refreshToken, expires_in, profile, done) => {
    const expires = new Date(Date.now() + (expires_in * 1000));
    console.log("Access Token: " + accessToken);
    console.log("Refresh Token: " + refreshToken);
    console.log("Expires in: " + expires_in);
    console.log("Expires: " + expires);
    let access = {
      provider: "spotify",
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresIn: expires_in,
      expires: expires
    };
    SpotifyUser.findOne({ spotifyId: profile.id })
    .then((currentUser) => {
      if (currentUser) {
        // User exists in the DB
        console.log("Existing Spotify user: " + currentUser);
        currentUser.access = access;
        done(null, currentUser);
      } else {
        // Create a new user in the DB
        let userParams = {
          name: profile.displayName,
          spotifyId: profile.id
        };
        if (profile.emails && profile.emails.length > 0) {
          userParams.email = profile.emails[0].value;
        }
        if (profile.pictures && profile.pictures.length > 0) {
          userParams.thumbURL = profile.photos[0].value;
        }
        new SpotifyUser(userParams).save()
        .then((newUser) => {
          console.log("New Spotify user: " + newUser);
          newUser.access = access;
          done(null, newUser);
        })
        .catch(err => console.log(err));
      }
    })
    .catch(err => console.log(err));
  })
);

// Serialize user identification in a session
passport.serializeUser((user, done) => {
  if (DEBUG) {
    console.log("Serializing...");
    console.log("  user: %O", user);
  }
  done(null, { id: user.id, access: user.access });
});

// Access user data in a session
passport.deserializeUser((params, done) => {
  if (DEBUG) {
    console.log("Deserializing...");
    console.log("  id: " + params.id);
    console.log("  provider: " + params.access.provider);
    console.log("  accessToken: " + params.access.accessToken);
    console.log("  refreshToken: " + params.access.refreshToken);
    console.log("  expires: " + params.access.expires);
  }
  SpotifyUser.findById(params.id, (err, user) => {
    if (user != null) {
      user.access = params.access;
      if (DEBUG) console.log("Spotify user deserialized: " + user);
      done(err, user);
    } else {
      done(err, false, { message: 'Could not login.'});
    }
  })
});

// EXPRESS APP

const app = express();
app.use(cors());

// Express sessions
app.use(session({
  secret: keys.session.secret,
  resave: true,
  saveUninitialized: true,
  cookie: { maxAge: 24 * 60 * 60 * 1000 } // 24 hours, in milliseconds
}));

// Passport initialization and sessions
app.use(passport.initialize());
app.use(passport.session());

// Connect flash
app.use(flash());

// JSON body parser
app.use(express.json());

// USER AUTH ROUTES

// Handle login using Spotify
app.get('/users/spotify', (req, res, next) => {
  passport.authenticate('spotify', {
    scope: ['user-read-email', 'user-read-private']
  })(req, res, next);
});

// Handle Spotify callback
app.get('/users/spotify/redirect', 
  passport.authenticate('spotify', {
    failureRedirect: '/',
    failureFlash: true
  }),
  (req, res, next) => {
    console.log("-------------------------------");
    console.log(`Spotify redirect, Origin: ${req.headers.origin}`);
    let user = {
        user: req.user,
        access: req.session.passport.user.access
    };
    loggedInUsers[user.user._id] = user;
    console.log("-------------------------------")
    console.log("... saved user: %O", user);
    console.log("-------------------------------")
    console.log("... logged in users %O:", loggedInUsers);
    console.log("-------------------------------")
    res.redirect(`/profile`);
  }
)

// Get info about logged in user
app.get('/users/info', verifyAuthenticated, (req, res) => {
  console.log("Get user info ...");
  console.log("... req.user: %O", req.user);
  console.log("... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... req.isAuthenticated() = " + req.isAuthenticated());
  const userID = req.session.passport.user.id;
  const userData = loggedInUsers[userID];
  if (userData) {
    console.log('... %O', userData);
    const user = {
      name: userData.user.name,
      provider: userData.access.provider,
      spotifyID: userData.user.spotifyId,
      email: userData.user.email,
      expires: userData.access.expires,
      imageURL: userData.user.thumbURL
    };
    res.send(user);
  } else {
    console.log(`Could not find user data for user with id=${userID} ... not logged in?`);
    req.logout();
    console.log("... after logout ... req.user: %O", req.user);
    console.log("... after logout ... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
    console.log("... req.isAuthenticated() = " + req.isAuthenticated());
    req.flash('message', 'Log in to continue ...');
    res.status(401);
    res.send({errors: ['User not logged in.']});
  };
});

// Handle logout
app.get('/users/logout', (req, res) => {
  console.log("Log out user ...");
  console.log("... req.user: %O", req.user);
  console.log("... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... req.isAuthenticated() = " + req.isAuthenticated());
  const userID = req.session && req.session.passport && req.session.passport.user.id;
  const userData = loggedInUsers[userID];
  if (userData) {
    delete loggedInUsers[userID];
  } else {
    console.log(`Could not find user data for user with id=${userID} ... not logged in?`);
  };
  req.logout();
  console.log("... after logout ... req.user: %O", req.user);
  console.log("... after logout ... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... req.isAuthenticated() = " + req.isAuthenticated());
  res.redirect('/');
});

// SPOTIFY SEARCH ROUTES

app.post('/spotify/search', verifyAuthenticated, (req, res) => {
  const { search_term } = req.body;
  console.log(`Search for: ${search_term}`);
  console.log("... session Passport user data %O", req.session && req.session.passport && req.session.passport.user);
  const sessionUserID = req.session.passport.user.id;
  let userData = loggedInUsers[sessionUserID];
  userData.id = sessionUserID;
  search(search_term, userData, (params) => {
    const { errors, userData, searchResults } = params;
    const userId = userData.id;
    res.send({ userId, errors, searchResults });
  });
});

const PORT = process.env.PORT || 8081;

app.listen(PORT, console.log(`Server started on port ${PORT}.`));
