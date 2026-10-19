// Central settings for the PDF toolkit.

// Which features are Premium. They are marked with the Premium badge today and gated once licensing is
// switched on (core/site-config.js). Change a value here to move a feature between Free and Premium.
export const PREMIUM_FEATURES = {
  compress: true, // make a PDF smaller
  splitMany: true, // split into several files at once, with ZIP download
};

// Largest accepted file. Everything is held in memory in the browser tab.
export const MAX_BYTES = 150 * 1024 * 1024;
export const MAX_FILES = 30;

// Strong compression: pages are redrawn as JPEG pictures. text stops being selectable.
export const LEVELS = {
  balanced: { dpi: 150, quality: 0.72 },
  strong: { dpi: 110, quality: 0.5 },
};
// Largest picture drawn for one page (pixels), so huge page formats cannot exhaust memory.
export const MAX_PIXELS = 24_000_000;
