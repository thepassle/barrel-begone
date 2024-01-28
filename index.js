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
 * 
 * - Barrel file minimal amount of exports treshold
 */



/**
 * @typedef {{
 *  level: 'error' | 'warning' | 'info';
 *  message: string;
 *  id: 'barrel-file' | 're-export-all' | 'import-all' | 'module-graph-size';
 *  loc?: {
 *   start: number,
 *   end: number
 *  }
 * }} Diagnostic
 */

async function main({ 
  cwd = process.cwd(),
  maxModuleGraphSize = 10,
} = {}) {
  /**
   * @type {{[key: string]: Diagnostic[]}}
   */
  const diagnostics = {};

  console.log("\n🛢️ BARREL BEGONE 🛢️\n")
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8').toString());

  if (!packageJson.exports) {
    throw new Error(`package.json does not have a "exports" field`);
  }

  const files = gatherFilesFromPackageExports(packageJson.exports, { cwd }).filter(f => !f.value.includes('package.json'));
  console.log('Analyzing the following entrypoints based on the "exports" field in package.json:');
  files.forEach(({key, value}) => console.log(`- "${key}": "${value}"`));
  console.log();

  for (const {_, value} of files) {
    console.log(`${bold(value)}:`)
    
    const filePath = path.join(cwd, value);
    diagnostics[filePath] = [];
    /**
     * This is the code (the findDependencies fn) that we should remove and replace with rollup and a plugin for measuring the module graph
     * In the plugin, we can probably also call the `analyzeFile` function, to see if any of the modules
     * in the module graph itself is also a barrel file, and warn about that. If we use a rollup plugin,
     * we can probably also detect the import chain leading to the file that imports from a barrel file, e.g.:
     * msw -> foo.js -> bar.js -> barrel-file.js
     */
    const dependencies = await findDependencies([filePath], { basePath: cwd });

    if (dependencies.length > maxModuleGraphSize) {
      diagnostics[filePath].unshift({
        level: 'error',
        message: `"${filePath}" leads to a module graph of ${dependencies.length} modules, which is more than the allowed maxModuleGraphSize of ${maxModuleGraphSize}.`,
        id: 'module-graph-size',
      });
    }

    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2015, true);
    analyzeFile(source, filePath, diagnostics);

    for (const diagnostic of diagnostics[filePath]) {
      if (diagnostic.level === 'error') {
        console.log(`  ${bold(red('[ERROR]'))}: ${diagnostic.message}`);
      } else if (diagnostic.level === 'warning') {
        console.log(`  ${bold(yellow('[WARNING]'))}: ${diagnostic.message}`);
      } else {
        console.log(`  ${bold('[INFO]')}: ${diagnostic.message}`);
      }
    }
  }

  // console.log(JSON.stringify(diagnostics, null, 2));
  return diagnostics;
}

// main();
main({
  cwd: path.join(process.cwd(), 'fixtures/barrel')
});