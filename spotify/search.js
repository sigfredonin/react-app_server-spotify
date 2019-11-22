const axios = require('axios');
const Album = require('../spotify/album');
const Artist = require('../spotify/artist');
const Track = require('../spotify/track');
const Playlist = require('../spotify/playlist');

const PAGE = 10;

const search = (search_term, userData, done) => {
  if (!search_term) {
    let errors = [];
    errors.push({ msg: "Enter a search term." });
    done({ errors, userData, searchResults: {search_term} });
  } else {
    const types = "album,artist,track,playlist";  // search for any
    const limit = `${PAGE}`;
    const endpointURL = "https://api.spotify.com/v1/search";
    const queryString = encodeURI(
        'q=' + search_term
      + '&type=' + types
      + '&limit=' + limit
    );
    const header = {
      Authorization: 'Bearer ' + userData.access.accessToken
    };
    console.log(".. %O", header);
    axios.get(endpointURL+'?'+queryString, {
      headers: header
    })
    .then(response => {
      // Albums
      const albums = response.data.albums.items.map((album) => {
        return new Album(album);
      });
      console.log("First Album: %O", albums[0]);
      // Artists
      const artists = response.data.artists.items.map((artist) => {
        return new Artist(artist);
      });
      console.log("First Artist: %O", artists[0]);
      // Tracks
      const tracks = response.data.tracks.items.map((track) => {
        return new Track(track);
      });
      console.log("First Track: %O", tracks[0]);
      // Playlists
      const playlists = response.data.playlists.items.map((playlist) => {
        return new Playlist(playlist);
      });
      console.log("First Playlist: %O", playlists[0]);
      const searchResults = {
        search_term,
        spotifyResponse: {
          albums: albums,
          artists: artists,
          tracks: tracks,
          playlists: playlists
        }
      };
      done({ errors: [], userData, searchResults });
    })
    .catch(error => {
      console.log('Error: %O', error);
      console.log('---> %O', error.response.data.error);
      const { status, message } = error.response.data.error;
      let errors = [];
      errors.push({ msg: `Error: ${status} ${message}` });
      done({ errors, userData, searchResults: {search_term} });
    });
  }
};

module.exports = search;
