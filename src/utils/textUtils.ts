/**
 * Text and script utilities for internationalization.
 */

// Pre-compiled regex matching CJK, Hiragana, Katakana, Hangul, Thai, Cyrillic, Arabic, Devanagari, Greek, Hebrew
const NON_LATIN_SCRIPT_REGEX =
  /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uac00-\ud7af\u0e00-\u0e7f\u0400-\u04ff\u0600-\u06ff\u0900-\u097f\u0370-\u03ff\u0590-\u05ff]/;

/**
 * Detects if a text contains non-Latin scripts (CJK, Thai, Korean Hangul, Cyrillic, Arabic, Hebrew, Greek, Devanagari, etc.).
 * Returns false for pure Latin alphabets (including European accented characters like é, ü, ñ).
 */
export const hasNonLatinScript = (text: string): boolean => {
  if (!text) return false;
  return NON_LATIN_SCRIPT_REGEX.test(text);
};
