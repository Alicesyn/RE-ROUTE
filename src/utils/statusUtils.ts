export type BusinessStatus =
  | "OPERATIONAL"
  | "CLOSED_TEMPORARILY"
  | "CLOSED_PERMANENTLY";

export interface PlaceStatusCheckable {
  name?: string;
  businessStatus?: string;
  editorialSummary?: string;
  description?: string;
}

/**
 * Returns true if the place is known to be permanently closed.
 */
export const isPermanentlyClosed = (
  place?: PlaceStatusCheckable | null
): boolean => {
  if (!place) return false;

  if (place.businessStatus === "CLOSED_PERMANENTLY") {
    return true;
  }

  const name = place.name || "";
  if (
    /\b(permanently closed|closed permanently|shut down permanently|no longer in business|out of business)\b/i.test(
      name
    )
  ) {
    return true;
  }
  if (
    /\((permanently closed|closed permanently)\)/i.test(name) ||
    /\[(permanently closed|closed permanently)\]/i.test(name)
  ) {
    return true;
  }

  const summary = `${place.editorialSummary || ""} ${place.description || ""}`;
  if (
    /\b(permanently closed|closed permanently|ceased operations|shut down permanently|no longer in business|out of business)\b/i.test(
      summary
    )
  ) {
    return true;
  }

  return false;
};

/**
 * Returns true if the place is temporarily closed.
 */
export const isTemporarilyClosed = (
  place?: PlaceStatusCheckable | null
): boolean => {
  if (!place) return false;

  if (place.businessStatus === "CLOSED_TEMPORARILY") {
    return true;
  }

  const name = place.name || "";
  if (/\b(temporarily closed|closed temporarily)\b/i.test(name)) {
    return true;
  }
  if (
    /\((temporarily closed|closed temporarily)\)/i.test(name) ||
    /\[(temporarily closed|closed temporarily)\]/i.test(name)
  ) {
    return true;
  }

  return false;
};

/**
 * Returns true if the place is closed (either permanently or temporarily).
 * Used to filter places from suggestions and recommendations.
 */
export const isPlaceClosed = (
  place?: PlaceStatusCheckable | null
): boolean => {
  if (!place) return false;
  return isPermanentlyClosed(place) || isTemporarilyClosed(place);
};
