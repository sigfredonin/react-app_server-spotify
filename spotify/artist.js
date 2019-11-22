class Artist {
  constructor (artistJSON) {
    const { id, name, external_urls, images, genres } = artistJSON;
    this.id = id;
    this.name = name;
    this.spotify_url = external_urls.spotify;
    this.image_url = images[0] ? images[0].url : "../images/person_wispy_hair.jpg";
    this.genres = genres;
  }
};

module.exports = Artist;
