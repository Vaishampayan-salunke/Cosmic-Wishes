// ─────────────────────────────────────────────────────────────
//  CONFIG — the only file you need to edit before deploying.
//  Paste your Firebase web config below. If it is empty or wrong, the
//  site shows a red banner and refuses to launch wishes (it never
//  silently saves them only in one browser).
// ─────────────────────────────────────────────────────────────
export const CONFIG = {
  APP_NAME: 'Cosmic Wishes',
  TAGLINE: 'Every wish is a star.',

  // How many pre-existing wishes are generated (seeded, never hard-coded). 5000–10000 recommended.
  GENERATED_WISHES: 8000,

  // Your web app's Firebase configuration
  firebase : {
    apiKey: "AIzaSyDrPGN9Ig2NG3WP0IesbDLn1ers_a7UWpc",
    authDomain: "cosmic-wishes.firebaseapp.com",
    projectId: "cosmic-wishes",
    storageBucket: "cosmic-wishes.firebasestorage.app",
    messagingSenderId: "200141112947",
    appId: "1:200141112947:web:c5739807e0d1730f5a0c06"
  },


  // Anti-spam: seconds a visitor must wait between launching wishes (client-side only).
  POST_COOLDOWN_SECONDS: 20,

  // Very small word filter for names & public wishes. Add or remove words freely.
  BLOCKED_WORDS: ['fuck', 'fucking', 'shit', 'bitch', 'asshole', 'bastard', 'cunt', 'whore', 'slut'],
};

export const FIREBASE_ENABLED = !!(CONFIG.firebase.apiKey && CONFIG.firebase.projectId);
