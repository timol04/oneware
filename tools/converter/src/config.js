// Central settings for the document converter.

// Which features are Premium. They are marked with the Premium badge today and gated once licensing is
// switched on (core/site-config.js). Change a value here to move a feature between Free and Premium.
export const PREMIUM_FEATURES = {
  batch: true, // several files in one go (including several pictures in one PDF)
};

// Largest accepted file. Everything is held in memory in the browser tab.
export const MAX_BYTES = 80 * 1024 * 1024;
// Files per run (Premium).
export const MAX_FILES = 50;
