# ✦ Cosmic Wishes

Every wish becomes a star (or a planet) in a living galaxy. Pure **HTML + CSS + JavaScript** — no build step —
with **Firebase** (free Spark plan) for accounts + database and **Vercel** (free) for hosting.

## What's inside

> **Every public wish is anonymous** — the starter wishes and everyone's real public wishes show as *Anonymous*, and the author's name is never stored on a public star. Only the author sees *You* and can find their own star again (**Profile → View in sky**, or Search → **My stars only**). A **private** wish sent to a friend shows your account name (set in Profile → Me) only to the friend who opens your link.

| Feature | How it works |
|---|---|
| Landing + animated sky | Full-screen canvas: nebula, parallax stars, distant galaxies, **Sun**, phase-changing **Moon**, small **Black hole** (no wish is ever placed near them) |
| Pannable / zoomable sky | Drag, scroll-wheel, pinch, `+` `-` keys, zoom buttons, **Universe view** |
| 8,000 pre-existing wishes | **Generated** (seeded, same sky for everyone) in a Web Worker on page load — nothing hard-coded. Change `GENERATED_WISHES` in `js/config.js` (5,000–10,000 recommended) |
| Stars & planets by category | Love = pink-red star · Dreams = gold star · Career = amber-gold star · Health = green planet · Travel = blue ringed planet · Friendship = violet star · Other = white star |
| Make a wish | Wish (**no length limit**) + category — there is no name box; wishes are nameless → shooting star streaks in, settles in the sky with a burst of sparkles |
| Share | Personal link + code, Share / WhatsApp / Copy |
| Wishes for a friend | Sealed (only the private link opens it) or public "for Priya". Friend opens the link → camera flies to the pulsing star → card says *"A wish was launched for you by …"* |
| Private replies | Friend replies with a star; only the original sender can ever see it (bell notification + glowing satellites around the star) |
| Message in a bottle | Time-capsule wish that **cannot be read before its date** — enforced by the server rules, not just the page |
| Accounts + profile | Email/password and Google. Profile: wish history, wishes received, **Open a wish** (paste a link or code), notifications |
| Twinkle | One per person per star; most-twinkled stars glow brighter |
| Constellations | Join any two stars with a named line everyone can see |
| Wish granted | Mark your own wish "came true" → golden halo |
| Wish of the day | Spotlighted star + 🌟 button |
| Falling wishes | Real wishes streak across the sky now and then — catch one |
| Search & filter | By name, words, category, or "my stars" |
| Time-lapse | Watch the sky fill up in order of launch |
| Sound | Ambient space pad + chimes synthesised in the browser (no audio files). Mute button |
| Mobile | Fully responsive: bottom-sheet cards, touch pan/pinch |

---

## 1 · Try it locally (1 minute)

Browsers block ES modules from `file://`, so serve the folder:

```bash
cd cosmic-wishes
npx serve .            # or:  python3 -m http.server 8000
```
Open the printed address. If the Firebase keys in `js/config.js` are empty or wrong, the site shows a **red banner** and refuses to launch wishes — it will never pretend to save them only in your own browser.
(To play without a backend, open the site with `?demo=1` — wishes then stay in that one browser and are visible to nobody else.)

## 2 · Create the free Firebase backend (≈10 minutes)

1. Go to <https://console.firebase.google.com> → **Add project** → name it (e.g. `cosmic-wishes`). Google Analytics: turn **off**. Stay on the free **Spark** plan — no card needed.
2. **Build → Authentication → Get started → Sign-in method**
   - enable **Email/Password**
   - enable **Google** (pick your email as the support email)
3. **Build → Firestore Database → Create database** → choose **Production mode** → pick a location near your users (e.g. `asia-south1` Mumbai). *The location can't be changed later.*
4. Firestore → **Rules** tab → delete everything → paste the entire contents of **`firestore.rules`** → **Publish**. *(If you published an older copy, publish this one again — it adds the rule that keeps public wishes anonymous.)*
5. ⚙️ **Project settings → General → Your apps → `</>` (Web)** → register an app → copy the `firebaseConfig` values.
6. Open **`js/config.js`** and paste them in:

```js
firebase: {
  apiKey: 'AIza…',
  authDomain: 'your-project.firebaseapp.com',
  projectId: 'your-project',
  storageBucket: 'your-project.appspot.com',
  messagingSenderId: '123456789',
  appId: '1:123456789:web:abc123',
},
```
(The Firebase web config is not a secret — security comes from the rules you published in step 4.)

Reload — the red banner disappears and "Continue with Google" appears in the sign-in box. **Keep this edited `js/config.js` when you upload a new version of the site**, otherwise the keys are lost and the red banner returns.

## 3 · Deploy to Vercel (free)

**Option A — GitHub (recommended)**
1. Create a GitHub repo and push this folder to it (`index.html` must be at the repo root).
2. <https://vercel.com> → **Add New → Project** → import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory **empty**. Click **Deploy**.

**Option B — Vercel CLI**
```bash
npm i -g vercel
cd cosmic-wishes
vercel          # first deploy, answer the prompts (framework: Other)
vercel --prod   # publish
```

## 4 · ⚠️ Authorise your Vercel address in Firebase (do not skip)

Firebase → **Authentication → Settings → Authorized domains → Add domain** → add
`your-app.vercel.app` (and your custom domain if you have one). Without this, Google sign-in shows
*"This website address is not authorised"*.

## If the red banner shows

| Banner says | Fix |
|---|---|
| "Firebase keys are missing" | Paste the `firebaseConfig` into `js/config.js` (step 2.6) and redeploy. |
| "Firestore rules are not published" | Firestore → Rules → paste `firestore.rules` → Publish. |
| "Cannot reach the Firestore database" | Firestore Database → Create database (step 2.3); check `projectId`. |

Wishes launched while the banner is up are **not** saved anywhere. Once it is gone, every wish is stored in Firestore and is visible to everyone.

## 5 · Quick test after deploying

0. Open your site: **no banner**, counter reads 8,065+ wishes (8,000 generated + 65 hand-written ones from `js/curated.js`).
1. Open your site → **Make a Wish** → create an account → launch a wish. ✔ the star lands, a link appears.
2. Launch a **friend** wish (sealed). Open the link in a private window → you should see the message. Sign up there as a second user → **Reply privately**.
3. Back in your first window the 🔔 shows a badge → Profile → Alerts → the reply is there.
4. Open the sealed star **without** the link (search it) → it must say "A sealed wish".

If any step fails, send me the message you see and the browser console (F12 → Console) text.

---

## Free-tier limits (Firebase Spark)

50,000 document reads / 20,000 writes per day and 1 GiB storage. The app is built to stay inside that:
- the 8,000 starter wishes are generated in the browser — **zero** database reads;
- visitors cache real stars in their browser and only download what changed since their last visit;
- a wish's full text is fetched only when someone opens that star.

A brand-new visitor costs roughly one read per real wish in the sky, so once you have thousands of real wishes
you may eventually need the paid plan. When the free quota is exhausted Firebase simply refuses requests until the
next day — you are never charged on Spark.

## Privacy & safety notes

- **Public wishes are anonymous**: the star record holds no name (the rules reject one), search can't find people by name, and only you can locate your own stars. (Test wishes launched on an older version may still have a name stored in Firestore — delete them with the card's Delete button or from the console.)
- **Sealed wishes** are stored under an unguessable 80-bit code (the link); the public sky only holds a star with no text and no name.
- **Replies** can be read only by the sender and the receiver (rules enforce it).
- **Time capsules** are locked by the server clock in the rules, so nobody can read them early — not even by editing the page.
- Text limit: there's no limit in the UI; technically Firestore documents cap at ~1 MB, so the form stops at ~900 KB of text (that's about a novel).
- The word filter (public wishes only) and 20-second cooldown are **client-side** conveniences — a determined person could bypass them. Use the **Report** button data (Firestore → `reports`) and delete abusive stars from the console if needed.

## Customising

`js/config.js` → app name, tagline, number of generated wishes, cooldown, blocked words.
Colours/typography: `css/style.css` (CSS variables at the top). World bodies (positions, keep-out radii): `js/world.js`.
Category → object/colour mapping: `CATS` in `js/util.js`.

## Project structure

```
index.html            page skeleton
css/style.css         all styling (responsive)
firestore.rules       paste into Firebase console → Firestore → Rules
vercel.json           optional Vercel settings
js/config.js          ← the only file you must edit (Firebase keys)
js/app.js             wires everything together
js/sky.js             canvas engine (camera, drawing, Sun/Moon/Black hole, effects, time-lapse)
js/sprites.js         pre-rendered glow / planet / nebula textures (all drawn in code)
js/wishgen.js         seeded generator for the starter wishes (+ generator.js / generator.worker.js)
js/store-firebase.js  live data layer       js/store-local.js  demo layer (?demo=1 only)   js/store-offline.js  refuses writes when Firebase is broken
js/ui-*.js            create form, wish card, profile, search, sign-in
js/audio.js           synthesised ambient sound + chimes
```

## What was tested

Every feature was exercised end to end in a real Chromium browser (desktop and phone sizes): sky, launch animation,
very long wishes, friend links, sealed wishes, replies and notifications, time capsules, twinkles, constellations,
search, time-lapse, shooting-star catch, delete, sign-in/out — once against the demo data layer and once against the
Firebase data layer using a stand-in Firebase SDK. The real Firebase servers and your published security rules could
not be reached from the build environment, so step 5 above is your first live check.
