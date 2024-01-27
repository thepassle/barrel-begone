import fs from 'fs';
import path from 'path';
import { red, bold, yellow } from 'kleur/colors';

import ts from 'typescript';
import { findDependencies } from './find-dependencies.js';
import { gatherFilesFromPackageExports } from './package-exports.js';
import { analyzeFile } from './analyze-file.js';

/**
 * @TODOS
 * - It would also be cool to crawl the module graph, and see how many imports a given entrypoint file will lead to. 
 *    E.g.: importing 'foo' leads to 100 other modules being imported
 *    We can probably use something similar to this for that: https://github.com/open-wc/custom-elements-manifest/blob/master/packages/find-dependencies/src/find-dependencies.js
 * - It would also be cool to see if an entrypoint imports from another barrel file, perhaps in a dependency, or even internally, like this example in MSW: https://github.com/mswjs/msw/pull/1987/files
 */

async function main({ 
  cwd = process.cwd(),
  maxModuleGraphSize = 10,
} = {}) {
  console.log("\n🛢️ BARREL BEGONE 🛢️\n")
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8').toString());

  if (!packageJson.exports) {
    throw new Error(`package.json does not have a "exports" field`);
  }

  const files = gatherFilesFromPackageExports(packageJson.exports, { cwd }).filter(f => !f.includes('package.json'));
  console.log('Analyzing the following entrypoints based on the "exports" field in package.json:');
  files.forEach(file => console.log(`- ${file}`));
  console.log();

  for (const file of files) {
    const filePath = path.join(cwd, file);
    const dependencies = await findDependencies([filePath], { basePath: cwd });

    if (dependencies.length > maxModuleGraphSize) {
      console.log(`${bold(yellow('[WARNING]'))}: "${filePath}" leads to a module graph of ${dependencies.length} modules, which is more than the allowed maxModuleGraphSize of ${maxModuleGraphSize}.`);
    }

    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2015, true);
    const { exports, declarations } = analyzeFile(source, filePath);

    if (exports > declarations) {
      console.log(`${bold(red('[FAIL]'))}: "${filePath}" is a barrel file.`);
    }
  }
}

// main();
main({
  cwd: path.join(process.cwd(), 'fixtures/barrel')
});