const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const session = require('express-session');
const flash = require('connect-flash');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const dateFormat = require('dateformat');
const keys = require('./config/keys');
const search = require("./spotify/search");

const DEBUG = true;

// TIMESTAMPS

// Current UTC time in the format
//    yyyy-mm-dd'T'HH:MM:ss'Z'
// Example: 2019-12-18T21:14:07Z
function time() {
  return dateFormat("isoUtcDateTime");
};

// LOGGED IN USERS CACHE

let loggedInUsers = {}; // { <id>: { user: <data from login> } }

function verifyAuthenticated(req, res, next) {
  // If user has been properly logged in, then req.user.id will exist
  // and loggedInUsers[req.user.id] will contain the cached user info.
  // Also, req.isAuthenticated() will return true.
  const userID = req.user && req.user.id;
  console.log("-------------------------------")
  console.log(`${time()} Is user authenticated? id=${userID} ...`);
  if (loggedInUsers[userID]) {
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
    console.log("-------------------------------")
    console.log(`${time()} Passport Spotify strategy callback ...`)
    const expires = new Date(Date.now() + (expires_in * 1000));
    console.log("  Access Token: " + accessToken);
    console.log("  Refresh Token: " + refreshToken);
    console.log("  Expires in: " + expires_in);
    console.log("  Expires: " + expires);
    let access = {
      provider: "spotify",
      accessToken: accessToken,
      refreshToken: refreshToken,
      expiresIn: expires_in,
      expires: expires
    };
    SpotifyUser.findOne({ spotifyId: profile.id })
    // Note: currentUser is a Mongo DB object, not just the stored document!
    .then((currentUser) => {
      if (currentUser) {
        // User exists in the DB
        console.log("Existing Spotify user: " + currentUser);
        const loginUser = {
          id: currentUser._id,
          userData: currentUser,
          access: access
        };
        done(null, loginUser);
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
        // Note: currentUser is a Mongo DB object, not just the stored document!
        .then((newUser) => {
          console.log("New Spotify user: " + newUser);
          const loginUser = {
            id: currentUser._id,
            userData: newUser,
            access: access
          };
          done(null, loginUser);
        })
        .catch(err => console.log(err));
      }
    })
    .catch(err => console.log(err));
  })
);

// Serialize user data in a session
passport.serializeUser((user, done) => {
  if (DEBUG) {
    console.log("-------------------------------")
    console.log(`${time()} Serializing ...`);
    console.log("  user: %O", user);
  }
  done(null, user);
});

// Access user data in a session
passport.deserializeUser((params, done) => {
  if (DEBUG) {
    console.log("-------------------------------")
    console.log(`${time()} Deserializing ...`);
    console.log("  params: %O", params);
    console.log("  id: " + params.id);
    console.log("  provider: " + params.access.provider);
    console.log("  accessToken: " + params.access.accessToken);
    console.log("  refreshToken: " + params.access.refreshToken);
    console.log("  expires: " + params.access.expires);
  };
  done(null, params);
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
// ... MUST follow initialization of Express session object
app.use(passport.initialize());
app.use(passport.session());

// Connect flash
app.use(flash());

// JSON body parser
app.use(express.json());

// USER AUTH ROUTES

// Handle login using Spotify
app.get('/users/spotify', (req, res, next) => {
  console.log("-------------------------------")
  console.log(`${time()} Login with Spotify ...`);
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
    console.log(`${time()} Spotify redirect, Origin: ${req.headers.origin} ...`);
    console.log("... req.user: %O", req.user);
    const loggedInUser = {
      user: req.user.userData,    // Mongo DB User object
      access: req.user.access     // Spotify access data
    };
    loggedInUsers[req.user.id] = loggedInUser;
    console.log("... logged in users %O:", loggedInUsers);
    res.redirect(`/profile`);
  }
)

// Get info about logged in user
app.get('/users/info', verifyAuthenticated, (req, res) => {
  console.log("-------------------------------")
  console.log(`${time()} Get user info ...`);
  console.log("... req.user: %O", req.user);
  console.log("... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... req.isAuthenticated() = " + req.isAuthenticated());
  const userID = req.user && req.user.id;
  const userData = loggedInUsers[userID];
  if (userData) {
    console.log("... logged in user's cached data: %O", userData);
    const info = {
      name: userData.user.name,
      provider: userData.access.provider,
      spotifyID: userData.user.spotifyId,
      email: userData.user.email,
      expires: userData.access.expires,
      imageURL: userData.user.thumbURL
    };
    res.send(info);
  } else {
    // The verifyAuthenticated() middleware should have taken care of this case,
    // so this is some kind of failure or programming error.
    const error_message = `ERROR: Could not find user data for user with id=${userID} ... not logged in?`;
    console.log(error_message);
    req.logout();
    console.log("... after logout ... req.user: %O", req.user);
    console.log("... after logout ... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
    console.log("... after logout ... req.isAuthenticated() = " + req.isAuthenticated());
    req.flash('message', 'Log in to continue ...');
    res.status(500);
    res.send({errors: ['User not logged in.']});
  };
});

// Handle logout
app.get('/users/logout', verifyAuthenticated, (req, res) => {
  console.log("-------------------------------")
  console.log(`${time()} Log out user ...`);
  console.log("... req.user: %O", req.user);
  console.log("... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... req.isAuthenticated() = " + req.isAuthenticated());
  const userID = req.user && req.user.id;
  const userData = loggedInUsers[userID];
  let status = 200;
  let response = {};
  if (userData) {
    // Remove the user's entry from the logged in users cache.
    delete loggedInUsers[userID];
    response = { message: `User with id=${userID} logged out.`};
  } else {
    // The verifyAuthenticated() middleware should have taken care of this case,
    // so this is some kind of failure or programming error.
    const error_message = `ERROR: Could not find user data for user with id=${userID} ... not logged in?`;
    console.log(error_message);
    status = 500;
    response = { errors: [ error_message ] };
  };
  req.logout();
  console.log("... after logout ... req.user: %O", req.user);
  console.log("... after logout ... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... after logout ... req.isAuthenticated() = " + req.isAuthenticated());
  res.status(status);
  res.send(response);
});

// SPOTIFY SEARCH ROUTES

app.post('/spotify/search', verifyAuthenticated, (req, res) => {
  const { search_term } = req.body;
  console.log("-------------------------------")
  console.log(`${time()} Search for: ${search_term} ...`);
  console.log("... req.user: %O", req.user);
  console.log("... req.session.passport.user: %O", req.session && req.session.passport && req.session.passport.user);
  console.log("... req.isAuthenticated() = " + req.isAuthenticated());
  const userID = req.user && req.user.id;
  let userData = loggedInUsers[userID];
  userData.id = userID;
  search(search_term, userData, (params) => {
    const { errors, userData, searchResults } = params;
    const userId = userData.id;
    res.send({ userId, errors, searchResults });
  });
});

const PORT = process.env.PORT || 8081;

app.listen(PORT, console.log(`Server started at ${time()} on port ${PORT}.`));
