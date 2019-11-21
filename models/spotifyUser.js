const mongoose = require('mongoose');

const spotifySchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    spotifyId: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: false
    },
    thumbURL: {
        type: String,
        required: false
    },
    date: {
        type: Date,
        default: Date.now
    }
});

const spotifyUser = mongoose.model('SpotifyUser', spotifySchema);

module.exports = spotifyUser;
