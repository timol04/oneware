// Central settings for QR Pro Studio.

// Size of the standard PNG in pixels (about 8 cm in print at 300 dpi).
export const QR_SIZE = 1000;
// "PNG large" (for posters).
export const QR_SIZE_LARGE = 3000;

// Swatches in the style panel. Every colour must stay dark enough to scan.
// "steel" is the tool accent (#467986), the others are plain choices.
export const SWATCHES = [
  { id: 'black', color: '#000000' },
  { id: 'steel', color: '#2f6070' },
  { id: 'forest', color: '#1f5c46' },
  { id: 'navy', color: '#1b4f9c' },
  { id: 'brick', color: '#a8321e' },
  { id: 'plum', color: '#5b2a4e' },
  { id: 'steelDeep', color: ['#467986', '#1b3a4a'] },
  { id: 'ocean', color: ['#0b7ba8', '#1b3a8c'] },
  { id: 'sunset', color: ['#c2410c', '#7b2a85'] },
  { id: 'berry', color: ['#b0286b', '#4b2a8c'] },
];

// From this length on, the code gets dense and a hint appears.
export const LONG_TEXT_LIMIT = 250;
