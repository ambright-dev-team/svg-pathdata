# svg-pathdata

This repo was forked from https://github.com/alecmev/svg-pathdata/tree/esm to fix the issue with incorrect "types" in package.json
It had `"types": "lib/SVGPathData.d.ts"`, and because of it we could not import types like CommandM, that are available in `lib/types.d.ts`.

This pull request https://github.com/nfroidure/svg-pathdata/pull/67 was merged, but the original authors have not compiled a new package version.

- npm ci
- npm run build
- npm publish
