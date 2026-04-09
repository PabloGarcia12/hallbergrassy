# HR Market Watch

Hallberg-Rassy listings tracker. Auto-scrapes YachtWorld daily via GitHub Actions.

## Files

```
index.html          ← the website
boats.json          ← boat data (auto-updated daily)
scraper.js          ← the scraper script
.github/
  workflows/
    scrape.yml      ← GitHub Action (runs scraper daily)
```

## One-time Setup (15 minutes)

### Step 1 — Create a GitHub repository

1. Go to github.com → click the **+** button → **New repository**
2. Name it `hr-market-watch` (or anything you like)
3. Set it to **Public** (required for free Netlify)
4. Click **Create repository**

### Step 2 — Upload the files

1. On your new repo page, click **Add file → Upload files**
2. Upload ALL files, preserving the folder structure:
   - `index.html`
   - `boats.json`
   - `scraper.js`
   - `.github/workflows/scrape.yml`
3. Click **Commit changes**

> Note: to upload the `.github/workflows/scrape.yml` file, you may need to create
> the folder structure manually using the GitHub web editor:
> click **Add file → Create new file**, type `.github/workflows/scrape.yml`
> in the filename box, then paste the contents.

### Step 3 — Enable GitHub Actions write permission

1. In your repo → **Settings** → **Actions** → **General**
2. Scroll to **Workflow permissions**
3. Select **Read and write permissions**
4. Click **Save**

### Step 4 — Connect to Netlify

1. Go to netlify.com → **Add new site → Import an existing project**
2. Choose **GitHub** → authorize → select your `hr-market-watch` repo
3. Leave all build settings blank (no build command needed)
4. Click **Deploy site**

Netlify will give you a URL like `https://fancy-name-123.netlify.app`

### Step 5 — Enable auto-deploy on data updates

Netlify will automatically redeploy whenever GitHub pushes a new commit —
which happens every time the scraper runs and updates `boats.json`. Nothing
extra to configure.

### Step 6 — Test the scraper manually (optional)

In your GitHub repo:
1. Go to **Actions** tab
2. Click **Daily HR Listings Scrape**
3. Click **Run workflow → Run workflow**

This runs the scraper immediately without waiting for 6am.

## Customizing the schedule

Edit `.github/workflows/scrape.yml` and change the cron line:

```yaml
- cron: '0 6 * * *'   # 06:00 UTC daily
- cron: '0 12 * * *'  # 12:00 UTC daily
- cron: '0 6 * * 1'   # Every Monday at 06:00 UTC
```

## If the scraper stops working

YachtWorld occasionally updates its HTML structure, which can break
the CSS selectors in `scraper.js`. If `boats.json` stops updating:

1. Go to yachtworld.com, search Hallberg-Rassy, right-click a listing card
2. Click **Inspect** and find the class names on the listing cards
3. Update the selectors in `scraper.js` around line 100

Or just ask Claude to fix it — paste the new HTML and it will update the selectors.

## Manually editing a boat entry

Open `boats.json` directly in GitHub (click the file → pencil icon to edit).
Change the `status` field to:
- `"for-sale"` — active listing
- `"under-offer"` — under contract / pending
- `"sold"` — sold / off market

Commit the change. Netlify redeploys in ~30 seconds.
