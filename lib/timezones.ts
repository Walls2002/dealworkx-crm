/**
 * Lead exports carry Country, State and City but no timezone; the old Sheet worked it out with a formula.
 * This does the same: state-level for the multi-zone countries we sell into, country-level for the rest.
 */
const US: Record<string, string> = {
  alabama: "America/Chicago", alaska: "America/Anchorage", arizona: "America/Phoenix", arkansas: "America/Chicago",
  california: "America/Los_Angeles", colorado: "America/Denver", connecticut: "America/New_York", delaware: "America/New_York",
  "district of columbia": "America/New_York", florida: "America/New_York", georgia: "America/New_York", hawaii: "Pacific/Honolulu",
  idaho: "America/Boise", illinois: "America/Chicago", indiana: "America/Indiana/Indianapolis", iowa: "America/Chicago",
  kansas: "America/Chicago", kentucky: "America/New_York", louisiana: "America/Chicago", maine: "America/New_York",
  maryland: "America/New_York", massachusetts: "America/New_York", michigan: "America/Detroit", minnesota: "America/Chicago",
  mississippi: "America/Chicago", missouri: "America/Chicago", montana: "America/Denver", nebraska: "America/Chicago",
  nevada: "America/Los_Angeles", "new hampshire": "America/New_York", "new jersey": "America/New_York", "new mexico": "America/Denver",
  "new york": "America/New_York", "north carolina": "America/New_York", "north dakota": "America/Chicago", ohio: "America/New_York",
  oklahoma: "America/Chicago", oregon: "America/Los_Angeles", pennsylvania: "America/New_York", "rhode island": "America/New_York",
  "south carolina": "America/New_York", "south dakota": "America/Chicago", tennessee: "America/Chicago", texas: "America/Chicago",
  utah: "America/Denver", vermont: "America/New_York", virginia: "America/New_York", washington: "America/Los_Angeles",
  "west virginia": "America/New_York", wisconsin: "America/Chicago", wyoming: "America/Denver", "puerto rico": "America/Puerto_Rico",
};
const CANADA: Record<string, string> = {
  "british columbia": "America/Vancouver", alberta: "America/Edmonton", saskatchewan: "America/Regina", manitoba: "America/Winnipeg",
  ontario: "America/Toronto", quebec: "America/Toronto", "québec": "America/Toronto", "new brunswick": "America/Halifax",
  "nova scotia": "America/Halifax", "prince edward island": "America/Halifax", "newfoundland and labrador": "America/St_Johns",
  yukon: "America/Whitehorse", "northwest territories": "America/Yellowknife", nunavut: "America/Iqaluit",
};
const AUSTRALIA: Record<string, string> = {
  "new south wales": "Australia/Sydney", victoria: "Australia/Melbourne", queensland: "Australia/Brisbane",
  "western australia": "Australia/Perth", "south australia": "Australia/Adelaide", tasmania: "Australia/Hobart",
  "australian capital territory": "Australia/Sydney", "northern territory": "Australia/Darwin",
};
const COUNTRY: Record<string, string> = {
  "united states": "America/New_York", usa: "America/New_York", canada: "America/Toronto", australia: "Australia/Sydney",
  "united kingdom": "Europe/London", uk: "Europe/London", england: "Europe/London", scotland: "Europe/London", wales: "Europe/London",
  ireland: "Europe/Dublin", germany: "Europe/Berlin", france: "Europe/Paris", spain: "Europe/Madrid", italy: "Europe/Rome",
  netherlands: "Europe/Amsterdam", belgium: "Europe/Brussels", switzerland: "Europe/Zurich", austria: "Europe/Vienna",
  sweden: "Europe/Stockholm", norway: "Europe/Oslo", denmark: "Europe/Copenhagen", finland: "Europe/Helsinki", poland: "Europe/Warsaw",
  portugal: "Europe/Lisbon", "czech republic": "Europe/Prague", czechia: "Europe/Prague", greece: "Europe/Athens", israel: "Asia/Jerusalem",
  "united arab emirates": "Asia/Dubai", "saudi arabia": "Asia/Riyadh", india: "Asia/Kolkata", singapore: "Asia/Singapore",
  philippines: "Asia/Manila", malaysia: "Asia/Kuala_Lumpur", indonesia: "Asia/Jakarta", thailand: "Asia/Bangkok", vietnam: "Asia/Ho_Chi_Minh",
  "hong kong": "Asia/Hong_Kong", japan: "Asia/Tokyo", "south korea": "Asia/Seoul", china: "Asia/Shanghai", taiwan: "Asia/Taipei",
  "new zealand": "Pacific/Auckland", "south africa": "Africa/Johannesburg", nigeria: "Africa/Lagos", kenya: "Africa/Nairobi",
  egypt: "Africa/Cairo", mexico: "America/Mexico_City", brazil: "America/Sao_Paulo", argentina: "America/Argentina/Buenos_Aires",
  chile: "America/Santiago", colombia: "America/Bogota", peru: "America/Lima",
};

const key = (s: string) => s.trim().toLowerCase();

/** Best-guess IANA timezone from Country and State; "" when the country is unknown. */
export function guessTimezone(country: string, state: string): string {
  const c = key(country), s = key(state);
  if (c === "united states" || c === "usa" || c === "us") return US[s] ?? COUNTRY["united states"];
  if (c === "canada") return CANADA[s] ?? COUNTRY.canada;
  if (c === "australia") return AUSTRALIA[s] ?? COUNTRY.australia;
  return COUNTRY[c] ?? "";
}
