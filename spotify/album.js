class Album {
  constructor (albumJSON) {
    const { id, name, external_urls, images, release_date, total_tracks, artists } = albumJSON;
    const artist_names = artists.map((artist) => {
      return artist.name;
    });
    this.id = id;
    this.name = name;
    this.artists = artist_names;
    this.spotify_url = external_urls.spotify;
    this.image_url = images[0].url;
    this.release_date = release_date;
    this.tracks = total_tracks;
  }
};

module.exports = Album;
