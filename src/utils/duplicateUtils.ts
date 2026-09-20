import { Place } from "../types";
import { hasNonLatinScript } from "./textUtils";

/**
 * Normalizes text for comparison by standardizing Unicode, removing accents,
 * normalizing punctuation/symbols to separators, collapsing whitespace, and lowercasing.
 * Preserves letters and digits from all alphabets and scripts (Latin, CJK, Cyrillic, Arabic, etc.).
 */
export const normalizeString = (str: string): string => {
  if (!str) return "";
  const cleaned = str
    .normalize("NFKC")
    .replace(/[đĐ]/g, "d")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/['’‘`]/g, "") // Remove apostrophes so McDonald's matches McDonalds
    .replace(/[^\p{L}\p{N}\s]/gu, " ") // Convert punctuation, separators, and symbols to space
    .replace(/\s+/g, " ")
    .trim();

  // If text only consisted of symbols (e.g. "???" or "***"), fallback to trimmed lowercase
  return cleaned || str.trim().toLowerCase();
};

/**
 * Simplifies name by standardizing English connectors (e.g., "and" created or typed)
 */
const simplifyName = (norm: string): string =>
  norm.replace(/\band\b/gi, " ").replace(/\s+/g, " ").trim();

/**
 * Compares two normalized place names, checking exact match, simplified match,
 * space-collapsed match, and nearby substring/prefix matches.
 */
export const isNameMatch = (aName: string, bName: string, isNearby: boolean): boolean => {
  if (!aName || !bName) return false;
  if (aName === bName) return true;

  const aSimple = simplifyName(aName);
  const bSimple = simplifyName(bName);
  if (aSimple === bSimple) return true;

  const aNoSpace = aSimple.replace(/\s+/g, "");
  const bNoSpace = bSimple.replace(/\s+/g, "");
  if (aNoSpace && aNoSpace === bNoSpace) return true;

  if (isNearby) {
    const shorter = aSimple.length <= bSimple.length ? aSimple : bSimple;
    const longer = aSimple.length <= bSimple.length ? bSimple : aSimple;
    const isForeign = hasNonLatinScript(shorter);
    const minLen = isForeign ? 2 : 3;
    const minRatio = isForeign ? 0.35 : 0.4;

    if (shorter.length >= minLen && longer.includes(shorter) && shorter.length / longer.length >= minRatio) {
      return true;
    }

    const shorterNoSpace = aNoSpace.length <= bNoSpace.length ? aNoSpace : bNoSpace;
    const longerNoSpace = aNoSpace.length <= bNoSpace.length ? bNoSpace : aNoSpace;
    if (shorterNoSpace.length >= minLen && longerNoSpace.includes(shorterNoSpace) && shorterNoSpace.length / longerNoSpace.length >= minRatio) {
      return true;
    }
  }

  return false;
};

/**
 * Checks whether two places are considered duplicates of each other.
 */
export const isDuplicatePlace = (
  a: {
    id?: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    googlePlaceId?: string;
    romanizedName?: string;
  },
  b: {
    id?: string;
    name: string;
    address?: string;
    lat?: number;
    lng?: number;
    googlePlaceId?: string;
    romanizedName?: string;
  }
): boolean => {
  if (!a || !b) return false;
  if (a.id && b.id && a.id === b.id) return false; // Not a duplicate of self

  // 1. Google Place ID match
  if (
    (a.googlePlaceId && b.googlePlaceId && a.googlePlaceId === b.googlePlaceId) ||
    (a.googlePlaceId && b.id && a.googlePlaceId === b.id) ||
    (a.id && b.googlePlaceId && a.id === b.googlePlaceId)
  ) {
    return true;
  }

  const aName = normalizeString(a.name);
  const bName = normalizeString(b.name);
  const aRom = a.romanizedName ? normalizeString(a.romanizedName) : "";
  const bRom = b.romanizedName ? normalizeString(b.romanizedName) : "";

  if (!aName || !bName) return false;

  const hasCoordsA = typeof a.lat === "number" && typeof a.lng === "number";
  const hasCoordsB = typeof b.lat === "number" && typeof b.lng === "number";

  // 2. Both places have coordinates
  if (hasCoordsA && hasCoordsB) {
    const dLat = Math.abs(a.lat! - b.lat!);
    const dLng = Math.abs(a.lng! - b.lng!);
    const isNearby = dLat < 0.0025 && dLng < 0.0025; // within ~250m

    // If locations are more than 250m apart, they are distinct locations
    if (!isNearby) {
      return false;
    }

    // Name match at the same location
    if (
      isNameMatch(aName, bName, true) ||
      (aRom && isNameMatch(aRom, bName, true)) ||
      (bRom && isNameMatch(aName, bRom, true)) ||
      (aRom && bRom && isNameMatch(aRom, bRom, true))
    ) {
      return true;
    }

    return false;
  }

  // 3. Fallback when coordinates are missing on one or both:
  // Must have name match (without relaxed substring matching)
  if (
    isNameMatch(aName, bName, false) ||
    (aRom && isNameMatch(aRom, bName, false)) ||
    (bRom && isNameMatch(aName, bRom, false)) ||
    (aRom && bRom && isNameMatch(aRom, bRom, false))
  ) {
    const aAddr = normalizeString(a.address || "");
    const bAddr = normalizeString(b.address || "");

    // If both have addresses, ensure they don't clearly conflict
    if (aAddr && bAddr) {
      const aAddrNoSpace = aAddr.replace(/\s+/g, "");
      const bAddrNoSpace = bAddr.replace(/\s+/g, "");
      return (
        aAddr === bAddr ||
        aAddrNoSpace === bAddrNoSpace ||
        aAddr.includes(bAddr) ||
        bAddr.includes(aAddr) ||
        aAddrNoSpace.includes(bAddrNoSpace) ||
        bAddrNoSpace.includes(aAddrNoSpace)
      );
    }
    return true;
  }

  return false;
};

/**
 * Finds all place IDs that have at least one duplicate in the given list.
 */
export const findDuplicatePlaceIds = (places: Place[]): Set<string> => {
  const duplicates = new Set<string>();

  for (let i = 0; i < places.length; i++) {
    if (places[i].dismissedDuplicate) continue;
    for (let j = i + 1; j < places.length; j++) {
      if (places[j].dismissedDuplicate) continue;
      if (isDuplicatePlace(places[i], places[j])) {
        duplicates.add(places[i].id);
        duplicates.add(places[j].id);
      }
    }
  }

  return duplicates;
};

/**
 * Groups places into clusters of duplicates.
 */
export const getDuplicateGroups = (places: Place[]): Place[][] => {
  const visited = new Set<string>();
  const groups: Place[][] = [];

  for (let i = 0; i < places.length; i++) {
    const current = places[i];
    if (current.dismissedDuplicate) continue;
    if (visited.has(current.id)) continue;

    const group: Place[] = [current];
    visited.add(current.id);

    for (let j = i + 1; j < places.length; j++) {
      const candidate = places[j];
      if (candidate.dismissedDuplicate) continue;
      if (visited.has(candidate.id)) continue;

      if (isDuplicatePlace(current, candidate)) {
        group.push(candidate);
        visited.add(candidate.id);
      }
    }

    if (group.length > 1) {
      groups.push(group);
    }
  }

  return groups;
};

/**
 * Returns the IDs of redundant places that should be removed when deduplicating.
 * Preserves assigned places (dayIndex !== null), starred places, or the first added place.
 */
export const getDuplicatePlaceIdsToRemove = (places: Place[]): string[] => {
  const groups = getDuplicateGroups(places);
  const idsToRemove: string[] = [];

  for (const group of groups) {
    // Score each place to determine the best one to keep
    // Highest score is kept, all others in the group are removed
    const scored = group.map((p, index) => {
      let score = 0;
      if (p.dayIndex !== null) score += 100; // Keep assigned places
      if (p.isStarred) score += 50; // Keep starred places
      if (p.customTime) score += 30; // Keep locked reservations
      if (p.notes) score += 20; // Keep user notes
      if (p.descriptionSource === "user") score += 20; // Keep user descriptions
      if (!p.isDisabled) score += 10; // Prefer active over disabled
      // Tie breaker: earliest place in list
      score -= index;
      return { id: p.id, score };
    });

    scored.sort((a, b) => b.score - a.score);

    // Keep scored[0], mark all others for removal
    for (let k = 1; k < scored.length; k++) {
      idsToRemove.push(scored[k].id);
    }
  }

  return idsToRemove;
};
