const Module = require('node:module');

/**
 * Narrowly scoped CommonJS resolver hook for `ts-node`.
 *
 * In Prisma 7 with `moduleFormat = "cjs"` and `moduleResolution = "nodenext"`,
 * the generated Prisma client uses explicit `.js` import specifiers
 * (e.g. `./internal/class.js`, `./enums.js`).
 *
 * When `ts-node` executes source TypeScript files directly, Node's CJS module
 * loader looks for literal `.js` files on disk, which only exist after compilation.
 * This hook catches `MODULE_NOT_FOUND` errors for `.js` specifiers and falls back
 * to resolving without the `.js` extension, allowing `ts-node` to load the `.ts` files.
 */
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function (request, parent, isMain, options) {
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (err) {
    if (err && err.code === 'MODULE_NOT_FOUND' && request.endsWith('.js')) {
      const tsRequest = request.replace(/\.js$/, '');
      try {
        return originalResolveFilename.call(this, tsRequest, parent, isMain, options);
      } catch {
        // Fall back to throwing the original error if extensionless resolution also fails
      }
    }
    throw err;
  }
};

