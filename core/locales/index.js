/**
 * Registry of core dictionaries. English is the default language.
 * To add a language, create core/locales/<code>.js (copy en.js) and add one import + one entry below.
 */
import en from './en.js';
import de from './de.js';

export const LOCALES = { en, de };
