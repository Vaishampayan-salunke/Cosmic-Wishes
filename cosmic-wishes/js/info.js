// What we know about a star without a network call (generated stars compute their text on the fly).
import { describe } from './wishgen.js';
import { CAT_KEYS } from './util.js';

export function starInfo(s) {
  if (s.gen) {
    const d = describe(s.i, CAT_KEYS.indexOf(s.cat));
    return { name: d.name, text: d.text, preview: d.text, forName: '' };
  }
  const sealed = s.kind === 'sealed';
  return { name: sealed ? 'A sealed wish' : (s.name || 'Someone'), text: null, preview: sealed ? '' : (s.preview || ''), forName: s.forName || '' };
}
