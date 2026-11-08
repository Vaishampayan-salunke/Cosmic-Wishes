// Used when Firebase is missing or broken. It NEVER pretends to save: every write fails with a clear message,
// so wishes can't silently end up only in one browser. (Local "demo" mode exists only if you ask for it: ?demo=1)
const NO = (message) => Object.assign(new Error(message), { code: 'offline' });

export default function createOfflineStore(problem) {
  const msg = problem.message;
  const noop = () => () => {};
  return {
    mode: 'offline', problem,
    onAuth(cb) { cb(null); return () => {}; },
    subscribeStars: noop, subscribeBoosts: noop, subscribeConstellations: noop, subscribeInbox: noop,
    async signInGoogle() { throw NO(msg); }, async signUp() { throw NO(msg); }, async signIn() { throw NO(msg); },
    async signOut() {}, async setName() { throw NO(msg); },
    async createWish() { throw NO(msg); },
    async getStar() { return null; }, async getText() { return null; },
    async getSealed() { throw Object.assign(new Error(msg), { code: 'offline' }); },
    async listMine() { return { stars: [], sealed: [] }; },
    async twinkle() { throw NO(msg); }, async myTwinkle() { return false; },
    async setGranted() { throw NO(msg); }, async deleteWish() { throw NO(msg); },
    async addConstellation() { throw NO(msg); }, async sendReply() { throw NO(msg); },
    async noteOpened() {}, async markRead() {}, async recordReceived() {}, async listReceived() { return []; },
    async report() { throw NO(msg); },
  };
}
