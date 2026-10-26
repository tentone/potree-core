# Contributor guide

This guide applies to the entire repository. Update it when commands or architecture change.

## Project

`potree-core` renders preprocessed Potree point clouds in three.js applications. Shader code is written in GLSL for WebGL. The rest of the library uses TypeScript, with some existing JavaScript workers and utilities. Keep application UI and point-cloud conversion outside the library.

Start with `package.json`, `source/index.ts`, `source/potree.ts`, and `example/main.ts`. Use `rg` to find callers before changing shared code. Exclude generated output, binary fixtures, and vendor code from broad searches.

| Location | Purpose |
| --- | --- |
| `source/index.ts` | Public package exports. |
| `source/potree.ts` | Loader selection, visibility, point budget, loading, and LRU updates. |
| `source/point-cloud-*.ts` | Scene integration, octree nodes, bounds, picking, and disposal. |
| `source/loading/`, `source/workers/` | Legacy `cloud.js` loading and decoding. |
| `source/loading2/` | Potree 2 `metadata.json` loading, range requests, decoders, and worker pool. |
| `source/materials/` | Materials, clipping, color modes, gradients, and textures. |
| `source/materials/shaders/` | GLSL vertex (`.vs`) and fragment (`.fs`) shaders for WebGL. |
| `source/rendering/` | `PotreeRenderer`, eye-dome lighting (EDL), and screen passes. |
| `source/utils/` | Shared bounds, math, priority heap, and LRU helpers. |
| `source/types.ts`, `source/type-predicates.ts`, `source/constants.ts` | Shared types, node checks, and defaults. |
| `example/main.ts`, `example/data/` | Interactive demo and fixtures for both formats. |
| `webpack*.js`, `tsconfig.json`, `eslint.config.js` | Build and code checks. |

## Commands and checks

Run commands from the repository root. Use `npm install` when dependencies are missing. The lockfile is ignored, so do not assume `npm ci` works on a fresh checkout.

| Command | Purpose |
| --- | --- |
| `npx tsc --noEmit` | Check library TypeScript. |
| `npm run build` | Build ESM, declarations, workers, and shaders into `dist/`. |
| `npm run dev` | Watch the library build. |
| `npm start` | Build and serve the demo at `http://localhost:5200`. |
| `npm run lint` | Run ESLint with its current coverage limits. |
| `npm run lint-fix` | Apply lint fixes; review the resulting diff. |
| `npm run docs` | Generate TypeDoc documentation. |

For code changes, run type checking, build, lint, and relevant browser checks. There is no configured project test suite. Add focused regression coverage for nontrivial logic when practical. For documentation changes, check paths, commands, and whitespace.

- ESLint currently skips TypeScript files and excludes `source/loading2/**`. Passing lint does not prove TypeScript coverage.
- Root TypeScript checks cover `source/`, not the demo. Validate demo changes through the example webpack build and browser.
- The production build currently emits bundle-size warnings. Report new errors or meaningful size increases.
- Compilation does not verify shader execution, worker behavior, or HTTP range responses.
- Edit source files rather than ignored `dist/`, `build/`, or `docs/` output. `npm run pub` publishes to npm; use build/docs commands for validation.

## Loading and rendering

- Preserve both `cloud.js` and `metadata.json` loading, including base-URL and `RequestManager` overloads. Base URLs need a trailing slash. Keep URL resolution, fetching, headers, and options through the existing request hooks.
- Legacy clouds use `.hrc` hierarchy and per-node `.bin` files. Potree 2 uses `metadata.json`, `hierarchy.bin`, and `octree.bin` with range requests. Preserve `bigint` offsets, inclusive range ends, 22-byte little-endian hierarchy records, proxy nodes, and child ordering.
- Update loaders and worker messages together. Preserve attribute names, types, normalization, scale/offset handling, and buffer transfer lists. Transferred buffers become detached. Legacy `color` and Potree 2 `rgba` attributes differ.
- Keep the two point-attribute implementations separate unless their format differences are handled explicitly. Potree 2 selects its Brotli decoder when `encoding === 'BROTLI'`.
- Webpack keeps `three` external, imports shaders as strings, and bundles `*.worker.js` inline through `worker-loader`. Verify browser behavior when changing worker construction or bundling.
- Call `potree.updatePointClouds(...)` before rendering each frame. `PotreeRenderer.updateAndRender(...)` already does this. Visibility depends on frustum, projected size, level, clipping, and point budget; loading and GPU promotion are limited, and LRU handles eviction.
- Defaults are in `source/constants.ts`: one million points, four node loads, and two GPU promotions per frame. Geometry also has loading limits. Inspect both layers before changing concurrency.
- Preserve coordinate spaces and cloud offsets. Keep material uniforms, shaders, CPU culling, and picking consistent. Follow the clipping rules in `README.md`; CPU culling must not discard points that shaders would show.
- Handle fetch/decode failures and disposal during loading. Balance loading counters, avoid duplicate requests, release workers, and prevent late callbacks from restoring disposed geometry. Check each loader's actual promise completion behavior.
- Dispose owned GPU and worker resources. Restore temporary renderer, camera, layer, and material state after rendering or picking.

## Organization and cleanup

- Put code in the owning feature folder. Keep demo UI in `example/` and reusable library code in `source/`. Export public APIs through existing index files.
- Match nearby file names and exact import casing, including PascalCase files in `loading2/`. Use relative internal imports.
- Use typed interfaces and explicit public return types. Avoid new `any` and `@ts-ignore`. TypeScript strict mode is currently off.
- Use tabs, semicolons, single quotes, and Allman braces in new code. Keep edits focused; avoid unrelated formatting, dependency upgrades, or compiler changes.
- Search before adding helpers, constants, or types. Share code only when callers need the same behavior. Put shared spatial helpers in `source/utils/`.
- `createChildAABB` is duplicated in `source/loading2/OctreeLoader.ts` and `source/utils/bounds.ts`. Before merging it, check octant bits (z=1, y=2, x=4), mutation, and allocations. Similar format code may have different requirements.
- When replacing code, update callers and remove obsolete implementations, imports, branches, and commented-out alternatives in the touched scope. Check public exports and worker references before deletion.
- Avoid unnecessary allocations in frame traversal and point decoding. Keep heavy decoding in workers and use transferable buffers. Measure performance changes.
- Preserve vendor code and licenses in `source/loading2/libs/brotli/`. Avoid incidental changes to binary fixtures.

## Documentation and browser checks

Document public APIs with JSDoc covering purpose, parameters, defaults, units, coordinate space, completion, ownership, and errors where relevant. TypeDoc excludes undocumented symbols. Explain algorithms and invariants rather than repeating code. Correct stale comments in touched code.

Update `README.md` for user-visible changes and `example/main.ts` when a runnable example helps. Keep documentation and signatures consistent.

Choose checks relevant to the change:

- Loading: use both `example/data/lion_takanawa/cloud.js` and `example/data/pump/metadata.json`. Check progressive refinement, request limits, range responses, and console/worker errors. The pump fixture uses `DEFAULT` encoding; Brotli changes need a separate check.
- Visibility: check perspective/orthographic cameras, multiple transformed clouds, frustum exits, and budget changes.
- Materials and picking: check affected color/size modes, clipping modes and planes, and picks near boundaries.
- Rendering and disposal: toggle EDL, resize, change pixel ratio, render ordinary meshes alongside clouds, and check disposal/reloading. Check depth modes when changing shaders or depth handling.

Summarize what changed, why, checks performed, and remaining limitations.
