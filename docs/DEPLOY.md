# Deploy: Folder → GitHub Desktop → GitHub → Cloudflare Workers

The app is a Cloudflare Worker that serves the static files in `public/`. It has no server code, no database and no secrets. You set it up once, and after that every push to `main` deploys automatically.

---

## 1. Folder → GitHub Desktop

1. Open **GitHub Desktop**.
2. Go to **File → Add Local Repository…** and choose this `still-recovery` folder.
3. GitHub Desktop will say *"This directory does not appear to be a Git repository"*. Click **create a repository**.
   - Name: `still-recovery`
   - Git ignore: **None** (the project already has a `.gitignore`)
   - License: your choice
   - Click **Create Repository**.
4. GitHub Desktop makes the first commit. If it doesn't, type `Initial commit` as the summary and click **Commit to main**.

> `node_modules/` and `.wrangler/` are ignored on purpose. **Do** commit `package-lock.json`.
>
> If you downloaded the ZIP: unzip it, then point GitHub Desktop at the unzipped `still-recovery` folder.

## 2. GitHub Desktop → GitHub (web)

1. Click **Publish repository**.
2. Name: `still-recovery`. Choose private or public, then click **Publish Repository**.
3. Click **Repository → View on GitHub** to confirm the files are there.

## 3. GitHub → Cloudflare Workers (one-time)

1. Sign in at **dash.cloudflare.com** and go to **Workers & Pages → Create**.
2. Choose **Import a repository** and connect your GitHub account. Allow access to the `still-recovery` repo.
3. Select **still-recovery** and use these settings:

   | Setting | Value |
   |---|---|
   | Project name | `still-recovery` (must match `"name"` in `wrangler.jsonc`) |
   | Production branch | `main` |
   | Build command | `npm run check` *(lint + tests; a deploy is blocked if anything fails)* |
   | Deploy command | `npx wrangler deploy` *(the default)* |
   | Root directory | `/` (leave empty) |

4. Click **Save and Deploy**. The first build takes about a minute.
5. Your app is live at `https://still-recovery.<your-subdomain>.workers.dev`.

## 4. Everyday workflow

1. Edit files in this folder.
2. In GitHub Desktop, write a short summary and click **Commit to main**, then **Push origin**.
3. Cloudflare builds and deploys automatically. Progress is under **Workers & Pages → still-recovery → Deployments**.

Pushes to other branches create **preview** URLs, so you can test before merging into `main`.

## Optional

- **Custom domain:** go to Workers & Pages → still-recovery → Settings → Domains & Routes → Add → Custom domain. The domain must be on your Cloudflare account.
- **Deploy from your computer** (skips GitHub):

  ```bash
  npx wrangler login
  ```

  ```bash
  npm run deploy
  ```

- **Install on iPhone:** open the URL in Safari, then tap Share → **Add to Home Screen**. It opens full-screen and works offline.

## Troubleshooting

| Problem | Fix |
|---|---|
| Build says the name doesn't match | The Cloudflare project name must equal `"name"` in `wrangler.jsonc`. Change one of them so they match. |
| Old version still showing | Reload once, or close and reopen the home-screen app. The service worker tries the network first and only falls back to its cache when offline or slow (more than 2.5 s). |
| Build fails at `npm run check` | Run `npm run check` locally to see the lint or test error, fix it, and push again. |
| "Storage is full or blocked" toast | Private browsing blocks storage. Use a normal Safari or Chrome window. |
| Data missing on another device | This is by design: data lives only in the browser where it was entered. Use **You → Data → Export / Import** to move it. |
