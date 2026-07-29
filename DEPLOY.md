# Deploying to Vercel

The production build is verified: compiles clean, 113 kB first load, fully static.

## Fastest route (2 commands)

Open a terminal in this folder (`...\Kiko\Domino`) and run:

```bash
npx vercel login
npx vercel --prod
```

- `login` opens your browser — use the **same account as the sticker counter**, and
  the domino app just becomes a second project under it.
- `--prod` accepts the defaults; when it asks, keep the detected framework
  (**Next.js**) and the default build settings. Press Enter through the prompts.

You'll get a live URL at the end, something like `domino-xxxx.vercel.app`.

Nothing here needs environment variables, a database, or any paid feature —
phase 1 runs entirely in the browser.

## Redeploying after changes

```bash
npx vercel --prod
```

## Alternative: deploy from GitHub

If you'd rather have automatic deploys on every push:

1. Create an empty repo on GitHub.
2. In this folder:

   ```bash
   git init
   git add .
   git commit -m "Partner dominoes, phase 1"
   git branch -M main
   git remote add origin https://github.com/<you>/<repo>.git
   git push -u origin main
   ```

3. Go to vercel.com/new, import the repo, accept the defaults.

After that, every `git push` deploys automatically — which is the better setup
once we start on phase 2 (online play).

## Before you deploy — quick sanity check

```bash
npm test          # 52 tests
npm run build     # production build
```

## Note on the npm audit warning

`npm install` reports "3 high severity vulnerabilities". These are in dev-only
dependencies and don't ship to users. Do **not** run `npm audit fix --force` — it
installs breaking major versions. Leave it, or ask me to bump the versions
cleanly.
