class Playlist {
  constructor (playlistJSON) {
    const { id, name, external_urls, owner, tracks, images } = playlistJSON;
    this.id = id;
    this.name = name;
    this.owner = owner.display_name;
    this.spotify_url = external_urls.spotify;
    this.image_url = images[0].url;
    this.tracks = tracks.total;
  }
};

module.exports = Playlist;
