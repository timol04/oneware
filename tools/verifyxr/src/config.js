// Central settings for VerifyXR.

// Which features are Premium. They are marked with the Premium badge today and gated once licensing is
// switched on (core/site-config.js). Change a value here to move a feature between Free and Premium.
export const PREMIUM_FEATURES = {
  apa: true,       // APA 7 citation and reference list check
  batch: true,     // several files at once
  profiles: false, // saving own requirement profiles
  pdf: false,      // report as PDF (print dialog)
};

// Report lists are cut at this many findings per criterion.
export const MAX_FINDINGS = 25;
// Largest accepted file (a .docx is a zip; very large files would freeze the tab).
export const MAX_BYTES = 30 * 1024 * 1024;
