const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const passport = require('passport');
const SpotifyStrategy = require('passport-spotify').Strategy;
const keys = require('./config/keys');
const search = require("./spotify/search");

let loggedInUsers = {}; // { id: { user: <data from login> } }

const app = express();
app.use(cors());

// MongoDB config
const db = keys.mongo.dbURI;
mongoose.connect(db, {
    useNewUrlParser: true,
    useUnifiedTopology: true
  })
  .then(() => console.log("MongoDB connected."))
  .catch(err => console.log(err));

// PASSPORT

// User model
const SpotifyUser = require('./models/spotifyUser');

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

// Passport middleware
app.use(passport.initialize());
app.use(passport.session());

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
    console.log("... user: %O", user);
    console.log("... logged in users %O:", loggedInUsers);
    console.log("-------------------------------")
    const userString = JSON.stringify(user);
    const redirectURL = `/profile#id=${user.user._id}`;
    res.redirect(redirectURL);
  }
)

// Get info about logged in user
app.get('/users/info', (req, res) => {
  const id = req.query.id;
  console.log(`Get user info, id=${id}`);
  const userData = loggedInUsers[id];
  const user = {
    name: userData.user.name,
    provider: userData.access.provider,
    spotifyID: userData.user.spotifyId,
    email: userData.user.email,
    expires: userData.access.expires,
    imageURL: userData.user.thumbURL
  };
  res.send(user);
});

// Handle logout
app.get('/users/logout', (req, res) => {
  const id = req.query.id;
  console.log(`Log out user, id=${id}`);
  const userData = loggedInUsers[id];
  delete loggedInUsers[id];
  req.logout();
  const redirectURL = '/';
  res.redirect(redirectURL);
});

// SPOTIFY SEARCH ROUTES

// Body parser
app.use(express.urlencoded({ extended: false }));

app.post('/spotify/search', (req, res) => {
  const id = req.query.id;
  const { search_term } = req.body;
  console.log(`Search id=${id}, search=${search_term}`);
  const userData = loggedInUsers[id];
  search(search_term, userData, (params) => {
    const { errors, userData, searchResults } = params;
    res.send({ errors, searchResults });
  });
});

const PORT = process.env.PORT || 8081;

app.listen(PORT, console.log(`Server started on port ${PORT}.`));
