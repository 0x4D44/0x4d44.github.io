# Deploying Decet in the 0x4d44.github.io monorepo

This folder is the **master** copy of Decet (base-10 time). The app is served at
<https://0x4d44.github.io/emdtime/> from the **built** files one level up —
`emdtime/index.html` + `emdtime/assets/`. There is no CI; the build is committed
by hand (the site is GitHub Pages "deploy from branch").

## Layout

```
emdtime/
  index.html, assets/   <- served build (production, committed)
  source/               <- this project: source + 65 tests + build config
```

The source lives in `source/` (not at `emdtime/` root) because the served
`emdtime/index.html` and the source's dev `index.html` can't share one path.

## Rebuild & redeploy after a source change

```sh
cd emdtime/source
npm ci
npm test                       # 65 tests
npm run build                  # -> emdtime/source/dist/
rm -rf ../assets && cp -r dist/. ../    # replace the served build at emdtime/
# then commit emdtime/ (built) + emdtime/source/ (source) and push to main
```

Vite's `base` is `"./"`, so the built `index.html` references `./assets/...` and
works from the `/emdtime/` subpath.

## Archive

The original standalone repo `0x4D44/emdtime` is kept as a frozen archive (it also
holds the working journal and scratchpad). This monorepo copy is authoritative.
