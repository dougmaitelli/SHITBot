export interface MovieMatch {
  tmdbId: number;
  title: string;
  releaseYear?: number;
}

interface SearchMovieResult {
  id?: unknown;
  title?: unknown;
  release_date?: unknown;
}

interface SearchMovieResponse {
  results?: SearchMovieResult[];
}

interface ExternalIdsResponse {
  imdb_id?: unknown;
}

export class TmdbClient {
  constructor(
    private readonly token: string,
    private readonly fetchImplementation: typeof fetch = fetch,
  ) {}

  async searchMovies(query: string): Promise<MovieMatch[]> {
    const url = new URL("https://api.themoviedb.org/3/search/movie");
    url.searchParams.set("query", query);
    url.searchParams.set("include_adult", "false");
    url.searchParams.set("language", "en-US");

    const response = await this.request<SearchMovieResponse>(url);
    return (response.results ?? [])
      .filter((result): result is SearchMovieResult & { id: number; title: string } =>
        typeof result.id === "number" && typeof result.title === "string",
      )
      .slice(0, 5)
      .map((result) => {
        const year = typeof result.release_date === "string" ? Number(result.release_date.slice(0, 4)) : NaN;
        return {
          tmdbId: result.id,
          title: result.title,
          releaseYear: Number.isInteger(year) && year > 0 ? year : undefined,
        };
      });
  }

  async getImdbId(tmdbId: number): Promise<string | undefined> {
    const response = await this.request<ExternalIdsResponse>(
      new URL(`https://api.themoviedb.org/3/movie/${tmdbId}/external_ids`),
    );
    return typeof response.imdb_id === "string" && /^tt\d+$/.test(response.imdb_id)
      ? response.imdb_id
      : undefined;
  }

  private async request<T>(url: URL): Promise<T> {
    const response = await this.fetchImplementation(url, {
      signal: AbortSignal.timeout(5_000),
      headers: {
        accept: "application/json",
        authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok) throw new Error(`TMDB request failed with status ${response.status}`);
    return (await response.json()) as T;
  }
}
