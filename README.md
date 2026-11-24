# God's Word (KJV)

A free, ad-free Bible web app you can install from Chrome (PWA).

## What's inside
- `index.html` : layout and styles
- `app.js` : all the app logic (Today, Bible reader, Search, Help me, Saved, Settings)
- `data.js` : verse-of-the-day list, the 22 "What are you going through?" situations, prayers
- `data/bible/1.json` to `66.json` : the full King James Bible, one file per book
- `sw.js` : service worker (offline support)
- `manifest.webmanifest` + `icons/` : what makes it installable

No build step. It is plain HTML, CSS and JavaScript.

## Deploy on Vercel (free)
1. Create a new GitHub repo and upload everything in this folder (keep the folder structure).
2. Go to vercel.com, click **Add New > Project**, import the repo.
3. Framework Preset: **Other**. Leave Build Command and Output Directory empty.
4. Click **Deploy**. You get a link like `gods-word.vercel.app`.
5. Open the link in Chrome on your phone. Tap the menu, then **Install app** or **Add to Home screen**.

PWA install and offline mode need HTTPS, which Vercel gives you automatically.

## Editing content
- Daily verses and situations live in `data.js`. Edit the text there. Each verse has `ref` (reference), `b`/`c`/`v` (book number, chapter, verse) and `t` (the KJV text).
- If you edit `app.js` or `index.html`, bump `gw-shell-v1` to `gw-shell-v2` in `sw.js` so phones pick up the new version.

## Test locally
Run `python -m http.server 8000` inside this folder and open http://localhost:8000
