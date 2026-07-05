# StoreKit — Complete Setup & Deployment Guide
## Localhost → GitHub → Railway (Backend) → Vercel (Frontend)

---

## PART 1 — Prerequisites (install once)

Install these tools if you don't have them already.

### 1.1 Node.js (v18 or higher)
Download from https://nodejs.org → choose "LTS" version → install.

Verify install:
```bash
node --version   # should show v18.x.x or higher
npm --version    # should show 9.x.x or higher
```

### 1.2 Git
Download from https://git-scm.com/downloads → install.

Verify:
```bash
git --version    # should show git version 2.x.x
```

### 1.3 MongoDB (for localhost only)

**Option A — MongoDB Community (local install):**
- Download from https://www.mongodb.com/try/download/community
- Install and start the service
- Default connection string: `mongodb://localhost:27017`

**Option B — MongoDB Atlas (free cloud, easier — recommended):**
- Go to https://cloud.mongodb.com → sign up free
- Create a free cluster (M0 Sandbox)
- Database Access → Add Database User → set username + password
- Network Access → Add IP Address → Allow access from anywhere (0.0.0.0/0)
- Click "Connect" → "Connect your application" → copy the connection string
  - It looks like: `mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/storekit`

### 1.4 Vercel CLI
```bash
npm install -g vercel
vercel --version   # should show 30.x.x or higher
```

---

## PART 2 — Set Up the Project Locally

### 2.1 Extract the zip

Extract `storekit-complete.zip` anywhere on your computer, e.g.:
- Windows: `C:\Projects\storekit-complete\`
- Mac/Linux: `~/projects/storekit-complete/`

You will see this structure:
```
storekit-complete/
├── backend/
│   ├── .env.example
│   ├── package.json
│   ├── server.js
│   └── ...
├── frontend/
│   ├── .env.example
│   ├── package.json
│   ├── src/
│   └── ...
├── .gitignore
└── DEPLOY.md
```

### 2.2 Create backend .env file

```bash
cd storekit-complete/backend
cp .env.example .env
```

Now open `backend/.env` in any text editor and fill in:

```env
PORT=5001

# Use MongoDB Atlas string (recommended) or local:
MONGODB_URI=mongodb+srv://YOUR_USERNAME:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/storekit

# Make this a long random string (any 32+ characters):
JWT_SECRET=my_super_secret_key_change_this_abc123xyz789

# Keep as localhost for local dev:
FRONTEND_URL=http://localhost:3000

# Cloudinary — leave blank to use local disk storage for localhost:
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=

# Email — optional, leave blank if not using:
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=
EMAIL_PASS=
EMAIL_FROM=
```

> ⚠️ Never commit `.env` to Git. It is already listed in `.gitignore`.

### 2.3 Create frontend .env file

```bash
cd storekit-complete/frontend
cp .env.example .env
```

Open `frontend/.env` and leave it as-is for localhost:

```env
# Leave blank for localhost — React proxy handles it
REACT_APP_API_URL=
```

### 2.4 Install dependencies

Open a terminal and run:

```bash
# Backend dependencies
cd storekit-complete/backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

This will take 1–3 minutes each.

### 2.5 Seed the database (optional but recommended)

This adds sample products, categories, and an admin user:

```bash
cd storekit-complete/backend
npm run seed
```

After seeding you'll see:
```
✅ Database seeded successfully
👤 Admin: admin@storekit.local / admin123
```

Save these credentials — you'll use them to log into the admin panel.

### 2.6 Run the backend

Open a **new terminal window** and run:

```bash
cd storekit-complete/backend
npm run dev
```

You should see:
```
✅ MongoDB Connected
🚀 Server running on port 5001
```

Test it: open http://localhost:5001/api/health in your browser.
You should see: `{"status":"ok","time":"..."}`

### 2.7 Run the frontend

Open **another new terminal window** and run:

```bash
cd storekit-complete/frontend
npm start
```

After ~30 seconds your browser will open automatically at http://localhost:3000

The site is now running locally. ✅

### 2.8 Test the admin panel

Go to http://localhost:3000/admin and log in with:
- Email: `admin@storekit.local`
- Password: `admin123`

Try changing the theme in Settings → it should apply immediately with no flash.

---

## PART 3 — Push to GitHub (replacing old repository)

### 3.1 Configure Git identity (if not done before)

```bash
git config --global user.email "you@example.com"
git config --global user.name "Your Name"
```

### 3.2 Navigate to the project root

```bash
cd storekit-complete
```

### 3.3 Remove the old Git history and start fresh

Since you want to replace the old repository:

```bash
# Remove old git history
rm -rf .git         # Mac/Linux
# OR on Windows PowerShell:
# Remove-Item -Recurse -Force .git

# Initialise fresh
git init
git branch -M main
```

### 3.4 Stage and commit all files

```bash
git add .
git commit -m "feat: StoreKit v2 — fixed theme flash, home customizations, production bugs"
```

### 3.5 Connect to your existing GitHub repository

Replace `YOUR_USERNAME` and `YOUR_REPO_NAME` with your actual GitHub details:

```bash
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO_NAME.git
```

### 3.6 Force push (this replaces the old code)

```bash
git push --force origin main
```

> ⚠️ `--force` will overwrite the old repository. This is intentional since you want to replace it.

Go to your GitHub repository in the browser — you should see the new code.

---

## PART 4 — Deploy Backend to Railway

### 4.1 Create a Railway account

Go to https://railway.app → sign up with your GitHub account.

### 4.2 Create a new project

1. Click **"New Project"**
2. Click **"Deploy from GitHub repo"**
3. Select your repository
4. Railway will detect the project. When asked which folder, select **`backend`**
   (or set the root directory to `backend` in the service settings)

### 4.3 Set environment variables in Railway

In your Railway project → click the service → **Variables** tab → add each one:

| Variable | Value |
|---|---|
| `PORT` | `5001` |
| `MONGODB_URI` | your MongoDB Atlas connection string |
| `JWT_SECRET` | same long random string as your local .env |
| `FRONTEND_URL` | `https://YOUR-APP.vercel.app` ← fill in after Vercel deploy |
| `CLOUDINARY_CLOUD_NAME` | your Cloudinary value (or leave blank) |
| `CLOUDINARY_API_KEY` | your Cloudinary value (or leave blank) |
| `CLOUDINARY_API_SECRET` | your Cloudinary value (or leave blank) |
| `NODE_ENV` | `production` |

### 4.4 Set the root directory

In Railway → your service → **Settings** tab:
- **Root Directory**: `backend`
- **Start Command**: `npm start`

### 4.5 Deploy

Click **Deploy** (or it may have already started automatically).

Watch the logs — you should see:
```
✅ MongoDB Connected
🚀 Server running on port 5001
```

### 4.6 Get your Railway URL

In Railway → your service → **Settings** → **Networking** → **Generate Domain**.

It will look like: `https://storekit-backend-production.up.railway.app`

**Save this URL** — you will need it for Vercel.

### 4.7 Test the backend

Open `https://YOUR-RAILWAY-URL.up.railway.app/api/health` in your browser.
You should see: `{"status":"ok"}`

---

## PART 5 — Deploy Frontend to Vercel

### 5.1 Build the frontend first (test locally)

```bash
cd storekit-complete/frontend
npm run build
```

Fix any errors before deploying. Build should complete with:
```
Successfully compiled.
The build folder is ready to be deployed.
```

### 5.2 Log in to Vercel CLI

```bash
vercel login
```

Choose "Continue with GitHub" → it will open your browser → authorise.

### 5.3 Deploy to Vercel

```bash
cd storekit-complete/frontend
vercel
```

Answer the prompts:
```
? Set up and deploy "~/projects/storekit-complete/frontend"? → Y
? Which scope? → (select your account)
? Link to existing project? → N  (if first time)  OR  Y (if already exists)
? What's your project's name? → storekit   (or keep default)
? In which directory is your code located? → ./  (press Enter)
? Want to modify settings? → N
```

Vercel will deploy and give you a preview URL like:
`https://storekit-abc123.vercel.app`

### 5.4 Set environment variables in Vercel

This is the most important step for production:

**Option A — via Vercel CLI:**
```bash
vercel env add REACT_APP_API_URL production
# When prompted, enter your Railway URL:
# https://storekit-backend-production.up.railway.app
```

**Option B — via Vercel Dashboard:**
1. Go to https://vercel.com/dashboard
2. Click your StoreKit project
3. **Settings** → **Environment Variables**
4. Add:
   - Name: `REACT_APP_API_URL`
   - Value: `https://storekit-backend-production.up.railway.app`
   - Environment: ✅ Production, ✅ Preview, ✅ Development

### 5.5 Deploy to production

```bash
cd storekit-complete/frontend
vercel --prod
```

This creates your final production URL like:
`https://storekit.vercel.app`

### 5.6 Update Railway FRONTEND_URL

Now that you have your Vercel URL, go back to Railway:
- Your service → **Variables**
- Update `FRONTEND_URL` = `https://storekit.vercel.app` (your exact Vercel URL)
- Railway will automatically redeploy the backend.

---

## PART 6 — Final Verification

Open your production URL in an **incognito/private browser window** and verify:

| Test | Expected Result |
|---|---|
| Open site cold (no cache) | Correct theme loads immediately, NO orange flash |
| Open site with cache | Same theme, instant load, no flash |
| Admin → change theme → Save | New theme appears on customer site within 8 seconds |
| Admin → Layout Editor → reorder → Save | Home page sections reflect the new order |
| Newsletter section | Only appears if enabled in admin Settings |
| Hard refresh (Ctrl+Shift+R) | No flash, correct theme |

---

## PART 7 — Future Updates (git push workflow)

After making any code changes:

```bash
# From project root
git add .
git commit -m "your commit message"
git push origin main
```

- **Vercel** will auto-redeploy the frontend (if you connected GitHub in Vercel dashboard)
- **Railway** will auto-redeploy the backend

To trigger a manual redeploy:
```bash
# Frontend
cd frontend && vercel --prod

# Backend redeploys automatically on git push if Railway is connected to GitHub
```

---

## Troubleshooting

### "CORS error" in browser console
- Check that `FRONTEND_URL` in Railway exactly matches your Vercel URL (no trailing slash)
- Example: `https://storekit.vercel.app` not `https://storekit.vercel.app/`

### "Network Error" / API calls failing on production
- Check `REACT_APP_API_URL` is set in Vercel environment variables
- Must be the full Railway URL including `https://`
- After adding, redeploy: `vercel --prod`

### "Theme still flashing"
- Open browser DevTools → Application → Local Storage
- Delete `storekit_theme_v1` and `storekit_theme_settings`
- Reload — fresh fetch from API will rebuild the cache correctly

### "Cannot find module" build error
```bash
cd frontend && npm install
cd ../backend && npm install
```

### MongoDB connection error on Railway
- Check your Atlas IP whitelist includes `0.0.0.0/0`
- Check the connection string has your actual username/password (not `<username>`)

### Admin password forgotten
```bash
cd backend
npm run seed   # re-seeds with admin@storekit.local / admin123
```

---

## Quick Reference — Important URLs & Credentials

| Item | Value |
|---|---|
| Local frontend | http://localhost:3000 |
| Local backend | http://localhost:5001 |
| Local admin | http://localhost:3000/admin |
| Default admin email | admin@storekit.local |
| Default admin password | admin123 |
| Railway dashboard | https://railway.app/dashboard |
| Vercel dashboard | https://vercel.com/dashboard |
| MongoDB Atlas | https://cloud.mongodb.com |
