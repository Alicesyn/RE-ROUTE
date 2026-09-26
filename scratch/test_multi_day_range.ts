import { mergeOverlappingRanges, formatMultiRangeBadge, MAX_DAY_RANGES } from "../src/utils/dayRangeUtils";
import { DayRangeConstraint } from "../src/types";

console.log("=== Testing Multiple Date Range Restrictions Logic ===");

// 1. Test overlapping range merge
const inputRanges: DayRangeConstraint[] = [
  { startDay: 0, endDay: 1 },
  { startDay: 1, endDay: 3 },
  { startDay: 5, endDay: 6 },
];

const merged = mergeOverlappingRanges(inputRanges);
console.log("1. Merged overlapping ranges:", merged);
if (merged.length !== 2) throw new Error("Expected 2 merged ranges");
if (merged[0].startDay !== 0 || merged[0].endDay !== 3) throw new Error("Expected first range to be 0-3");
if (merged[1].startDay !== 5 || merged[1].endDay !== 6) throw new Error("Expected second range to be 5-6");

// 2. Test disjoint ranges
const disjointRanges: DayRangeConstraint[] = [
  { startDay: 0, endDay: 0 },
  { startDay: 2, endDay: 2 },
  { startDay: 4, endDay: 4 },
];
const mergedDisjoint = mergeOverlappingRanges(disjointRanges);
console.log("2. Merged disjoint ranges:", mergedDisjoint);
if (mergedDisjoint.length !== 3) throw new Error("Expected 3 disjoint ranges");

// 3. Test badge formatting
const badge = formatMultiRangeBadge(merged, "2026-10-01", { 0: "Arrival", 5: "Kyoto" });
console.log("3. Formatted multi-range badge:", badge);
if (!badge.fullLabel.includes("Oct 1") || !badge.fullLabel.includes("Oct 6")) {
  throw new Error("Badge label does not reflect merged ranges properly");
}

console.log("\n=== ALL MULTI-DAY RANGE TESTS PASSED! ===");
