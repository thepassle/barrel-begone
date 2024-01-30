import fs from 'fs';
import path from 'path';
import { red, bold, yellow, underline } from 'kleur/colors';
import { legacy } from 'resolve.exports';
import ts from 'typescript';
import { analyzeModuleGraph } from './analyze-module-graph.js';
import { gatherFilesFromPackageExports } from './package-exports.js';
import { analyzeFile } from './analyze-file.js';
import {
  DEFAULTS,
  getCliConfig,
  getUserConfig,
} from './config.js';

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
 *   maxModuleGraphSize: number,
 *   amountOfExportsToConsiderModuleAsBarrel: number,
 *   info: boolean,
 *   rollup: object
 *  }
 * }} Context
 */

export async function barrelBegone(programmaticConfig = {}) {

  const cliConfig = getCliConfig(process.argv);
  const userConfig = await getUserConfig(
    cliConfig?.cwd ?? DEFAULTS.cwd
  );


  /** Merged config, CLI args overrule userConfig, programmatic options overrule everything */
  const finalOptions = {
    ...DEFAULTS,
    ...userConfig,
    ...cliConfig,
    ...programmaticConfig,
  };

  /**
   * @type {{[key: string]: Diagnostic[]}}
   */
  const diagnostics = {};

  /** @type {Context} */
  const context = {
    currentFile: '',
    options: {
      ...finalOptions
    }
  }

  console.log(bold("\n🛢️ BARREL BEGONE 🛢️\n"));
  const packageJsonPath = path.join(context.options.cwd, 'package.json');
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8').toString());

  let files = [];
  if (packageJson.exports) {
    files = gatherFilesFromPackageExports(packageJson.exports, { cwd: context.options.cwd }).filter(f => !f.value.includes('package.json') && (f.value.endsWith('.js') || f.value.endsWith('.mjs')));
    console.log('Analyzing the following entrypoints based on the "exports" field in package.json:');
  } else {
    const value = legacy(packageJson, { cwd: context.options.cwd });
    files = [{key: '.', value}];

    if (value === undefined) {
      console.log(`No entrypoints found in the "module", "main", or "exports" field, exiting...`);
      return;
    }

    console.log('Analyzing the following entrypoints based on either the "module" or "main" field in package.json:');
  }

  files.forEach(({key, value}) => console.log(`- "${bold(key)}": "${underline(bold(value))}"`));
  console.log();

  for (const {_, value} of files) {
    const filePath = path.join(context.options.cwd, value);
    context.currentFile = filePath;
    diagnostics[filePath] = [];

    await analyzeModuleGraph(filePath, context, diagnostics);

    const source = ts.createSourceFile(filePath, fs.readFileSync(filePath, 'utf8'), ts.ScriptTarget.ES2015, true);
    const { diagnostics: d } = analyzeFile(source, filePath, {
      amountOfExportsToConsiderModuleAsBarrel: context.options.amountOfExportsToConsiderModuleAsBarrel,
    });
    diagnostics[filePath].unshift(...d);

    if (diagnostics[filePath].length) {
      console.log('\n❌' + ' ' + bold(value));
    } else {
      console.log('\n✅' + ' ' + bold(value));
      console.log(`  No issues found.`);
    }

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