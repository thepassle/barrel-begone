import { readConfig, ConfigLoaderError } from '@web/config-loader';
import commandLineArgs from 'command-line-args';

export const DEFAULTS = {
  cwd: process.cwd(),
  maxModuleGraphSize: 10,
  amountOfExportsToConsiderModuleAsBarrel: 3,
  info: false,
  rollup: {
    plugins: []
  }
};

export function getCliConfig(argv) {
  const optionDefinitions = [
    { name: 'cwd', type: String },
    { name: 'maxModuleGraphSize', type: Number },
    { name: 'amountOfExportsToConsiderModuleAsBarrel', type: Number },
    { name: 'info', type: Boolean },
  ];

  return commandLineArgs(optionDefinitions, { argv });
}

export async function getUserConfig(cwd = process.cwd()) {
  let userConfig = {};
  try {
    userConfig = await readConfig('barrel-begone.config', undefined, cwd);
  } catch (error) {
    if (error instanceof ConfigLoaderError) {
      console.error(error.message);
      return {};
    }
    console.error(error);
    return {};
  }

  return userConfig || {};
}