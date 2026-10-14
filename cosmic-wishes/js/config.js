// ─────────────────────────────────────────────────────────────
//  CONFIG — the only file you need to edit before deploying.
//  Leave the firebase values empty to run in DEMO MODE
//  (wishes are then saved only inside each visitor's own browser).
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  APP_NAME: 'Cosmic Wishes',
  TAGLINE: 'Every wish is a star.',

  // How many pre-existing wishes are generated (seeded, never hard-coded). 5000–10000 recommended.
  GENERATED_WISHES: 8000,

  // Paste your Firebase web-app config here (Firebase console → Project settings → Your apps → Web app).
  firebase: {
    apiKey: '',
    authDomain: '',
    projectId: '',
    storageBucket: '',
    messagingSenderId: '',
    appId: '',
  },

  // Anti-spam: seconds a visitor must wait between launching wishes (client-side only).
  POST_COOLDOWN_SECONDS: 20,

  // Very small word filter for names & public wishes. Add or remove words freely.
  BLOCKED_WORDS: ['fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'whore', 'slut'],
};

export const FIREBASE_ENABLED = !!(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
