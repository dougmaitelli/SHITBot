import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isMovieNightChannel } from "../src/commands/movie-night/channel-policy.js";

describe("movie-night channel policy", () => {
  it("allows only the configured channel name", () => {
    assert.equal(isMovieNightChannel("movie-nights", "movie-nights"), true);
    assert.equal(isMovieNightChannel("movie-nights", "#movie-nights"), true);
    assert.equal(isMovieNightChannel("general", "movie-nights"), false);
    assert.equal(isMovieNightChannel(undefined, "movie-nights"), false);
  });
});
