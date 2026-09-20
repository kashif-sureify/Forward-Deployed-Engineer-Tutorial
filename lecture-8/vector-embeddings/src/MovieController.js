const express = require("express");

class MovieController {
  constructor(movieService) {
    this.movieService = movieService;
    this.router = express.Router();
    this.router.post("/search", this.search.bind(this));
    this.router.get("/similar", this.similar.bind(this));
    this.router.get("/health", this.health.bind(this));
  }

  async search(req, res) {
    const query = typeof req.body?.query === "string" ? req.body.query : "";
    if (!query.trim()) {
      return res.status(400).json({ error: "query is required" });
    }

    try {
      const results = await this.movieService.search(query);
      return res.json({ query, results: results ?? [] });
    } catch (error) {
      console.error("Failed to search movies:", error);
      return res.status(500).json({ error: "Failed to search movies" });
    }
  }

  async similar(req, res) {
    const movieTitle = typeof req.query?.title === "string" ? req.query.title : "";
    if (!movieTitle.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    try {
      const results = await this.movieService.similarMovies(movieTitle);
      return res.json({ title: movieTitle, results: results ?? [] });
    } catch (error) {
      console.error("Failed to find similar movies:", error);
      return res.status(500).json({ error: "Failed to find similar movies" });
    }
  }

  async health(req, res) {
    return res.json({ status: "ok" });
  }
}

module.exports = MovieController;
