// Marks each build folder with its module format, so Node loads dist/esm as
// ES modules and dist/cjs as CommonJS regardless of the package's own "type".
import { writeFileSync } from 'node:fs';

writeFileSync('dist/esm/package.json', JSON.stringify({ type: 'module' }) + '\n');
writeFileSync('dist/cjs/package.json', JSON.stringify({ type: 'commonjs' }) + '\n');
