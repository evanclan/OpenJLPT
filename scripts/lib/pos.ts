/**
 * Short, learner-friendly labels for JMdict part-of-speech codes, for display (the website,
 * the Anki decks). data/json/pos.json keeps JMdict's own wording. The table lives in
 * pos-short.json so the Python exporter can share it.
 */
import { readFileSync } from 'node:fs';

export const POS_SHORT: Record<string, string> = JSON.parse(readFileSync(new URL('./pos-short.json', import.meta.url), 'utf8'));
