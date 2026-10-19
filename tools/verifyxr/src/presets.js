// Rule presets. The values are common examples, not official university requirements:
// users adjust them to the requirements of their lecturers.
const margins = (top, bottom, left, right) => ({ top, bottom, left, right });
const rules = (font, size, lineSpacing, m) => ({ font, size, lineSpacing, marginsCm: m, minWords: null, maxWords: null, minPages: null, maxPages: null, ignoreSpecial: true });

export const PRESETS = {
  standard: rules('Times New Roman', 12, 1.5, margins(2.5, 2.5, 2.5, 2.5)),
  arial: rules('Arial', 11, 1.5, margins(2.5, 2.5, 2.5, 2.5)),
  binding: rules('Times New Roman', 12, 1.5, margins(2.5, 2.5, 3, 2)),
};
export const PRESET_IDS = Object.keys(PRESETS);
export const DEFAULT_PRESET = 'standard';
