export interface MovieMatch {
  tmdbId: number;
  title: string;
  releaseYear?: number;
}

export interface MovieDetails extends MovieMatch {
  imdbId?: string;
  description?: string;
  posterUrl?: string;
  rating?: number;
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

interface MovieDetailsResponse {
  id?: unknown;
  title?: unknown;
  release_date?: unknown;
  overview?: unknown;
  poster_path?: unknown;
  vote_average?: unknown;
  external_ids?: ExternalIdsResponse;
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
      .filter(
        (result): result is SearchMovieResult & { id: number; title: string } =>
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

  async getMovieDetails(tmdbId: number): Promise<MovieDetails> {
    const url = new URL(`https://api.themoviedb.org/3/movie/${tmdbId}`);

    url.searchParams.set("append_to_response", "external_ids");
    url.searchParams.set("language", "en-US");
    const response = await this.request<MovieDetailsResponse>(url);

    if (typeof response.id !== "number" || typeof response.title !== "string") {
      throw new Error("TMDB returned invalid movie details");
    }

    const releaseYear = typeof response.release_date === "string" ? Number(response.release_date.slice(0, 4)) : NaN;
    const imdbId = response.external_ids?.imdb_id;

    return {
      tmdbId: response.id,
      title: response.title,
      releaseYear: Number.isInteger(releaseYear) && releaseYear > 0 ? releaseYear : undefined,
      imdbId: typeof imdbId === "string" && /^tt\d+$/.test(imdbId) ? imdbId : undefined,
      description: typeof response.overview === "string" && response.overview.trim() ? response.overview : undefined,
      posterUrl:
        typeof response.poster_path === "string" ? `https://image.tmdb.org/t/p/w500${response.poster_path}` : undefined,
      rating:
        typeof response.vote_average === "number" && Number.isFinite(response.vote_average)
          ? response.vote_average
          : undefined,
    };
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
