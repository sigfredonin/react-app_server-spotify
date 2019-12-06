class Artist {
  constructor (artistJSON) {
    const { id, name, external_urls, images, genres } = artistJSON;
    this.id = id;
    this.name = name;
    this.spotify_url = external_urls.spotify;
    if (images[0]) {
      this.image_url = images[0].url;
    }
    this.genres = genres;
  }
};

module.exports = Artist;
