import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { TmdbClient } from "../src/commands/movie-night/tmdb.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("TmdbClient", () => {
  it("searches movies with bearer authentication and normalizes results", async () => {
    let requestedUrl: URL | undefined;
    let requestedAuthorization: string | null = null;
    const client = new TmdbClient("secret-token", async (input, init) => {
      requestedUrl = new URL(input.toString());
      requestedAuthorization = new Headers(init?.headers).get("authorization");
      return jsonResponse({
        results: [
          { id: 348, title: "Alien", release_date: "1979-05-25" },
          { id: 999, title: "Unknown Date", release_date: "" },
          { id: "invalid", title: "Ignored" },
        ],
      });
    });

    const results = await client.searchMovies("Alien & friends");

    assert.equal(requestedUrl?.pathname, "/3/search/movie");
    assert.equal(requestedUrl?.searchParams.get("query"), "Alien & friends");
    assert.equal(requestedUrl?.searchParams.get("include_adult"), "false");
    assert.equal(requestedAuthorization, "Bearer secret-token");
    assert.deepEqual(results, [
      { tmdbId: 348, title: "Alien", releaseYear: 1979 },
      { tmdbId: 999, title: "Unknown Date", releaseYear: undefined },
    ]);
  });

  it("returns normalized movie details", async () => {
    let requestedUrl: URL | undefined;
    const client = new TmdbClient("token", async (input) => {
      requestedUrl = new URL(input.toString());
      return jsonResponse({
        id: 348,
        title: "Alien",
        release_date: "1979-05-25",
        overview: "In space no one can hear you scream.",
        poster_path: "/poster.jpg",
        vote_average: 8.2,
        external_ids: { imdb_id: "tt0078748" },
      });
    });

    assert.deepEqual(await client.getMovieDetails(348), {
      tmdbId: 348,
      title: "Alien",
      releaseYear: 1979,
      imdbId: "tt0078748",
      description: "In space no one can hear you scream.",
      posterUrl: "https://image.tmdb.org/t/p/w500/poster.jpg",
      rating: 8.2,
    });
    assert.equal(requestedUrl?.pathname, "/3/movie/348");
    assert.equal(requestedUrl?.searchParams.get("append_to_response"), "external_ids");
  });

  it("ignores malformed IMDb IDs", async () => {
    const client = new TmdbClient("token", async () =>
      jsonResponse({
        id: 348,
        title: "Alien",
        external_ids: { imdb_id: "not-an-imdb-id" },
      }),
    );
    assert.equal((await client.getMovieDetails(348)).imdbId, undefined);
  });

  it("throws when TMDB returns an error", async () => {
    const client = new TmdbClient("token", async () => jsonResponse({ status_message: "Unauthorized" }, 401));
    await assert.rejects(() => client.searchMovies("Alien"), /status 401/);
  });
});
