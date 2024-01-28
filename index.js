import fs from 'fs';
import path from 'path';
import { red, bold, yellow } from 'kleur/colors';

import ts from 'typescript';
import { analyzeModuleGraph } from './analyze-module-graph.js';
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
 * 
 * @typedef {{
 *  currentFile: string,
 *  options: {
 *   cwd: string,
 *   maxModuleGraphSize: number
 *  }
 * }} Context
 */

async function main({ 
  cwd = process.cwd(),
  maxModuleGraphSize = 1,
} = {}) {
  /**
   * @type {{[key: string]: Diagnostic[]}}
   */
  const diagnostics = {};
  /** @type {Context} */
  const context = {
    currentFile: '',
    options: {
      cwd,
      maxModuleGraphSize,
    }
  }

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
    context.currentFile = filePath;
    diagnostics[filePath] = [];

    await analyzeModuleGraph(filePath, context, diagnostics);

    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2015, true);
    const { diagnostics: d } = analyzeFile(source, filePath);
    diagnostics[filePath].unshift(...d);

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

  return diagnostics;
}

// main();
main({
  cwd: path.join(process.cwd(), 'fixtures/barrel')
});