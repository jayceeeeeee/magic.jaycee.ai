import { searchLocations } from "../services/geocoding.js";

export const createLocationSearch = ({ input, resultsList, initialLocation = null, onError, onSelect }) => {
  let selectedLocation = initialLocation;
  let searchTimeout = null;

  const clearResults = () => {
    resultsList.innerHTML = "";
    resultsList.hidden = true;
  };

  const renderResults = (locations) => {
    resultsList.innerHTML = "";

    if (!locations.length) {
      clearResults();
      return;
    }

    locations.forEach((location) => {
      const item = document.createElement("li");
      const button = document.createElement("button");

      button.className = "location-option";
      button.type = "button";
      button.textContent = location.display_name;

      button.addEventListener("click", () => {
        selectedLocation = {
          name: location.display_name,
          latitude: Number(location.lat),
          longitude: Number(location.lon),
        };

        input.value = selectedLocation.name;
        clearResults();
        onSelect?.(selectedLocation);
      });

      item.append(button);
      resultsList.append(item);
    });

    resultsList.hidden = false;
  };

  input.addEventListener("input", () => {
    selectedLocation = null;
    onSelect?.(selectedLocation);
    clearTimeout(searchTimeout);

    const query = input.value.trim();

    if (query.length < 3) {
      clearResults();
      return;
    }

    searchTimeout = setTimeout(async () => {
      try {
        const locations = await searchLocations(query);
        renderResults(locations);
      } catch {
        clearResults();
        onError("Location search is unavailable right now. Try again in a moment.");
      }
    }, 350);
  });

  document.addEventListener("click", (event) => {
    if (!event.target.closest(".location-field")) {
      clearResults();
    }
  });

  return {
    getSelectedLocation: () => selectedLocation,
    setSelectedLocation: (location) => {
      selectedLocation = location;
    },
  };
};
