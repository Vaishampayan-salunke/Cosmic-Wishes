// What we know about a star without a network call (generated stars compute their text on the fly).
// Every public wish is ANONYMOUS: nobody sees who wrote it except its author, who sees "You".
// (A sealed wish opened through its private link still shows the sender's name — that flow is separate.)
import { describe } from './wishgen.js';
import { CAT_KEYS } from './util.js';
import { ctx } from './ctx.js';

export function starInfo(s) {
  const mine = !!(ctx.user && s.ownerUid && s.ownerUid === ctx.user.uid);
  const who = mine ? 'You' : 'Anonymous';
  if (s.gen) {
    const text = s.text || describe(s.i, CAT_KEYS.indexOf(s.cat)).text;
    return { name: who, text, preview: text, forName: '' };
  }
  const sealed = s.kind === 'sealed';
  return { name: sealed ? 'A sealed wish' : who, text: null, preview: sealed ? '' : (s.preview || ''), forName: s.forName || '' };
}
