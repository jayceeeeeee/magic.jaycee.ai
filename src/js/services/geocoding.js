export const searchLocations = async (query) => {
  const endpoint = new URL("https://nominatim.openstreetmap.org/search");

  endpoint.searchParams.set("format", "json");
  endpoint.searchParams.set("addressdetails", "1");
  endpoint.searchParams.set("limit", "5");
  endpoint.searchParams.set("q", query);

  const response = await fetch(endpoint);

  if (!response.ok) {
    throw new Error("Location search failed.");
  }

  return response.json();
};
