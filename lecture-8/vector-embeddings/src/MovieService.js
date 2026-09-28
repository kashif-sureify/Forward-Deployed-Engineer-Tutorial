const fs = require('fs');
const path = require('path');
const MovieData = require('./model/MovieData');
const Movie = require('./model/Movie');
const MovieMatch = require('./model/MovieMatch');
const embeddingCache = require('./embeddingCache');
class MovieService {
  constructor(embeddingModel, jsonMapper) {
    this.embeddingModel = embeddingModel;
    this.jsonMapper = jsonMapper;
    this.moviesEmbedding = [];
  }

  async initializeMoviesEmbedding() {
   const resource = path.join(__dirname, "static/movies.json" );

   const inputStream = fs.readFileSync(resource, 'utf-8');
   const movieDataList = this.jsonMapper.parse(inputStream).map(movieData=> new MovieData(movieData.title, movieData.description));
   
   const descriptions = movieDataList.map(movieData => movieData.getDescription());

   let embeddings = embeddingCache.read(this.embeddingModel.model, descriptions);

   if (embeddings) {
    console.log(`Loaded ${embeddings.length} movie embeddings from cache (0 API requests).`);
   } else {
    console.log(`Embedding ${descriptions.length} movies in 1 batched request...`);
    embeddings = await this.embeddingModel.embedBatch(descriptions);
    embeddingCache.write(this.embeddingModel.model, descriptions, embeddings);
   }

   this.moviesEmbedding = movieDataList.map((movieData, index) =>
    new Movie(movieData.getTitle(), movieData.getDescription(), embeddings[index]));

  }

  async search(query) {
    const userEmbedding = await this.embeddingModel.embed(query);

    const matches = [];

    for (const movie of this.moviesEmbedding) {
      const similarity = this.cosineSimilarity(userEmbedding, movie.getEmbedding());
      const match = new MovieMatch(movie.getTitle(), movie.getDescription(), similarity);
      matches.push(match);
    }
    this.sortBySimilarity(matches);


    return this.topKMatches(matches, 3);
  }

  async similarMovies(movieTitle){
    const selectedMovie = this.findMovieByTitle(movieTitle);
    const matches = [];
    for (const movie of this.moviesEmbedding) {
      if (movie.getTitle().toLowerCase() === movieTitle.toLowerCase()) {
        continue;
      }
      const similarity = this.cosineSimilarity(selectedMovie.getEmbedding(), movie.getEmbedding());
      const match = new MovieMatch(movie.getTitle(), movie.getDescription(), similarity);
      matches.push(match);
    }
    this.sortBySimilarity(matches);

    return this.topKMatches(matches, 3);
    

  }

  findMovieByTitle(movieTitle) {
    for (const movie of this.moviesEmbedding) {
      if (movie.getTitle().toLowerCase() === movieTitle.toLowerCase()) {
        return movie;
      }
    }
    throw new Error(`Movie with title "${movieTitle}" not found`);
  }


  cosineSimilarity(a, b){
    let dotProduct = 0.0;
    let normA = 0.0;
    let normB = 0.0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  // Straight-line distance between the two points.
  // SMALLER = closer, so sortBySimilarity must be reversed to use this.
  euclideanDistance(a, b){
    let sum = 0.0;
    for (let i = 0; i < a.length; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }

  // Cosine similarity without the length normalisation.
  // LARGER = closer, so the existing sort works as-is.
  dotProduct(a, b){
    let dotProduct = 0.0;
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
    }
    return dotProduct;
  }

  sortBySimilarity(matches){
    matches.sort((first, second)=> second.getMatch() - first.getMatch())
  }

  topKMatches(matches, k) {
    const noOfMatches = Math.min(k, matches.length);
    return matches.slice(0, noOfMatches);
  }
}

module.exports = MovieService;