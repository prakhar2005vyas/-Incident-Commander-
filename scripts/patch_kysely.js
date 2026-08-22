import fs from 'node:fs';
import path from 'node:path';

const targetFile = path.resolve('node_modules/kysely/dist/migration/file-migration-provider.js');

if (fs.existsSync(targetFile)) {
  let code = fs.readFileSync(targetFile, 'utf-8');
  if (!code.includes('pathToFileURL')) {
    code = `/// <reference types="./file-migration-provider.d.ts" />\nimport { pathToFileURL } from 'node:url';\n` + code;
    code = code.replace(
      /await import\(\/\* webpackIgnore: true \*\/[^\)]+\)/g,
      'await import(/* webpackIgnore: true */ (process.platform === "win32" ? pathToFileURL(filePath).href : filePath))'
    );
    fs.writeFileSync(targetFile, code);
    console.log('[postinstall] Applied Windows ESM pathToFileURL patch to Kysely');
  }
}
