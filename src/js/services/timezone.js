export const getTimezoneForCoordinates = async ({ latitude, longitude }) => {
  const endpoint = new URL("https://timeapi.io/api/TimeZone/coordinate");

  endpoint.searchParams.set("latitude", String(latitude));
  endpoint.searchParams.set("longitude", String(longitude));

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Timezone lookup failed.");
  }

  const data = await response.json();
  const timezone = data?.timeZone || data?.timeZoneId || data?.ianaTimeZone || data?.id || "";

  if (!timezone) {
    throw new Error("Timezone was not found for this place.");
  }

  return timezone;
};
