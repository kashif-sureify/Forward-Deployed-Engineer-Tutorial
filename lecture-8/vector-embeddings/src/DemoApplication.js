const MovieService = require('./MovieService');
const MovieController = require('./MovieController');

class DemoApplication {
    static async main(embeddingModel) {
        console.log("Demo Application Started");
        const jsonMapper = JSON;
        const movieService = new MovieService(embeddingModel, jsonMapper);
        await movieService.initializeMoviesEmbedding();
        return new MovieController(movieService);
    }
}

module.exports = DemoApplication;