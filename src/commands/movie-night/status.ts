import type { MovieNight } from "./types.js";

export function isMovieNightClosed(night: MovieNight): boolean {
  return Boolean(night.closedAt) || night.startsAt <= Math.floor(Date.now() / 1000);
}
