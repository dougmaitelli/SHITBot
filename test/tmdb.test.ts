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
    const client = new TmdbClient("secret-token", (async (input, init) => {
      requestedUrl = new URL(input.toString());
      requestedAuthorization = new Headers(init?.headers).get("authorization");
      return jsonResponse({
        results: [
          { id: 348, title: "Alien", release_date: "1979-05-25" },
          { id: 999, title: "Unknown Date", release_date: "" },
          { id: "invalid", title: "Ignored" },
        ],
      });
    }) as typeof fetch);

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

  it("returns a valid IMDb ID", async () => {
    const client = new TmdbClient("token", (async () => jsonResponse({ imdb_id: "tt0078748" })) as typeof fetch);
    assert.equal(await client.getImdbId(348), "tt0078748");
  });

  it("ignores malformed IMDb IDs", async () => {
    const client = new TmdbClient("token", (async () => jsonResponse({ imdb_id: "not-an-imdb-id" })) as typeof fetch);
    assert.equal(await client.getImdbId(348), undefined);
  });

  it("throws when TMDB returns an error", async () => {
    const client = new TmdbClient("token", (async () => jsonResponse({ status_message: "Unauthorized" }, 401)) as typeof fetch);
    await assert.rejects(() => client.searchMovies("Alien"), /status 401/);
  });
});
