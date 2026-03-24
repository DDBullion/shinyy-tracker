# Shinyy Tracker — Setup Guide
## Get live on shinyytracker.com + App Stores

---

## STEP 1 — Create a GitHub Account (Free)
1. Go to **github.com** → click "Sign up"
2. Use your email, create a username and password
3. Verify your email

---

## STEP 2 — Create Your Repository
1. Once logged in, click the **"+"** button (top right) → "New repository"
2. Name it: `shinyy-tracker`
3. Set it to **Public**
4. Click **"Create repository"**

---

## STEP 3 — Upload Your Files
1. On the empty repo page, click **"uploading an existing file"**
2. Drag and drop ALL files from the `shinyy-tracker` folder:
   - `index.html`
   - `manifest.json`
   - `sw.js`
   - `_redirects`
   - The entire `icons/` folder
3. Click **"Commit changes"**

---

## STEP 4 — Create a Netlify Account (Free)
1. Go to **netlify.com** → click "Sign up"
2. Choose **"Sign up with GitHub"** — this links them automatically

---

## STEP 5 — Deploy from GitHub
1. In Netlify dashboard → click **"Add new site"** → "Import an existing project"
2. Choose **GitHub** → select your `shinyy-tracker` repository
3. Leave all settings as default → click **"Deploy site"**
4. Netlify gives you a free URL like `random-name-123.netlify.app` — your site is live!

> From now on: any time you edit a file on GitHub and save it, Netlify auto-deploys in ~30 seconds.

---

## STEP 6 — Buy Your Domain
1. Go to **namecheap.com** (or **cloudflare.com/registrar** — slightly cheaper)
2. Search for `shinyytracker.com`
3. Buy it (~$12–14/yr)

---

## STEP 7 — Connect Domain to Netlify
1. In Netlify → your site → **"Domain management"** → "Add custom domain"
2. Type `shinyytracker.com` → click "Verify"
3. Netlify will show you **nameservers** (looks like `dns1.p01.nsone.net`)
4. Go back to **Namecheap** → find your domain → "Manage" → "Nameservers"
5. Switch to "Custom DNS" and paste in the Netlify nameservers
6. Wait 10–30 minutes → **shinyytracker.com is live!**
7. Netlify auto-enables free HTTPS/SSL

---

## STEP 8 — Make On-the-Fly Edits
1. Go to **github.com** → your `shinyy-tracker` repo
2. Click `index.html`
3. Click the **pencil icon** (Edit) top right
4. Make your change (update a premium, mark OOS, add a product)
5. Click **"Commit changes"**
6. Netlify detects the change → deploys in ~30 seconds → live!

---

## STEP 9 — App Store Submission (Apple + Android)

### When you're ready:
1. Make sure **shinyytracker.com** is live and working
2. Go to **pwabuilder.com**
3. Enter `https://shinyytracker.com` → click "Start"
4. PWABuilder analyzes your site and packages it for both stores
5. Download the **iOS package** and **Android package**

### Apple App Store:
- Sign up at **developer.apple.com** ($99/yr)
- Use Xcode (Mac required) to submit the iOS package from PWABuilder
- Review takes 1–3 days

### Google Play Store:
- Sign up at **play.google.com/console** ($25 one-time fee)
- Upload the Android package from PWABuilder directly
- Review takes 1–3 days

---

## EDITING CHEAT SHEET
| Task | Where |
|------|-------|
| Update a premium price | GitHub → index.html → find dealer name → change `prem:` value |
| Mark item out of stock | GitHub → index.html → find item → add `, oos:true` |
| Add a new product | GitHub → index.html → copy an existing line, paste, edit |
| Change site name/colors | GitHub → index.html → edit at top of file |

---

## YOUR FILE STRUCTURE
```
shinyy-tracker/
├── index.html        ← The entire app
├── manifest.json     ← PWA config (name, icons, colors)
├── sw.js             ← Service worker (offline support)
├── _redirects        ← Netlify routing
└── icons/
    ├── icon-192.png
    ├── icon-512.png
    ├── icon-1024.png  ← App Store submission icon
    ├── apple-touch-icon.png
    └── ... (all sizes)
```
