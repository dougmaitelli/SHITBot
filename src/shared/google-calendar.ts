const GOOGLE_CALENDAR_URL = "https://calendar.google.com/calendar/render";

export interface GoogleCalendarLink {
  title: string;
  dates: string;
  details?: string;
  location?: string;
}

export function googleCalendarUrl({ title, dates, details, location }: GoogleCalendarLink): string {
  const url = new URL(GOOGLE_CALENDAR_URL);

  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", title);
  url.searchParams.set("dates", dates);

  if (details) url.searchParams.set("details", details);

  if (location) url.searchParams.set("location", location);

  return url.toString();
}
