import fs from 'fs';
import path from 'path';
import { red, bold, yellow } from 'kleur/colors';
import { legacy } from 'resolve.exports';
import ts from 'typescript';
import { analyzeModuleGraph } from './analyze-module-graph.js';
import { gatherFilesFromPackageExports } from './package-exports.js';
import { analyzeFile } from './analyze-file.js';

/**
 * @typedef {{
 *  level: 'error' | 'warning' | 'info';
 *  message: string;
 *  id: 'barrel-file' | 're-export-all' | 'import-all' | 'module-graph-size';
 *  data?: any;
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
  amountOfExportsToConsiderModuleAsBarrel = 2
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
      amountOfExportsToConsiderModuleAsBarrel
    }
  }

  console.log("\n🛢️ BARREL BEGONE 🛢️\n")
  const packageJsonPath = path.join(cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8').toString());

  let files = [];
  if (packageJson.exports) {
    files = gatherFilesFromPackageExports(packageJson.exports, { cwd }).filter(f => !f.value.includes('package.json'));
    console.log('Analyzing the following entrypoints based on the "exports" field in package.json:');
  } else {
    files = [legacy(packageJson, { cwd })];
    console.log('Analyzing the following entrypoints based on either the "module" or "main" field in package.json:');
  }

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
    const { diagnostics: d } = analyzeFile(source, filePath, {
      amountOfExportsToConsiderModuleAsBarrel: context.options.amountOfExportsToConsiderModuleAsBarrel,
    });
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

main();
// main({
//   cwd: path.join(process.cwd(), 'fixtures/barrel')
// });