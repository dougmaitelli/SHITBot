export function isMovieNightChannel(actualName: string | undefined, configuredName: string): boolean {
  return actualName === configuredName.replace(/^#/, "");
}
