#!/usr/bin/env node
const program = require('commander');
const pjson = require('../package.json');
const path = require('path');
const os = require('os');
const HocusProxus = require('../src/hocus-proxus.js');
const options = {};
const { Signale } = require('signale');
const logger = new Signale({
  scope: 'hocus-proxus'
});

program
  .version(pjson.version, '-v, --version', 'Current Version')
  .option('-r, --rules-path <path>', 'Absolute path for the Rules')
  .option('-c, --rules-config-file <path>', 'Absolute path for the Rules Config JSON File')
  .option('-i, --internal-ip <ip>', 'The internal IP')
  .option('-p, --proxy-port <port>', `The Proxy Port. Default 8001`)
  .option('-d, --domain <host>', `The host to be proxied. It will use the hocus proxus config,json by default`)
  .option('-w, --web-interface-port <port>', `The Web Interface Proxy Port. Default 8002`)
  .option('-j, --hocus-proxus-path <path>', `The Hocus Proxus Path. It is placed by default at the ${path.join(os.homedir(), 'hocus-proxus')}`)
  .option('-r, --proxy-pac-file <path>', `The Proxy Pac File. It is placed by default at the ${path.join(os.homedir(), 'hocus-proxus', 'proxy.pac')}`)
  .option('-l, --list-rules', `List All Available Rules`)
  .option('-g, --list-configs', `List Hocus Proxus Configs`)
  .option('-e, --enabled-rule <rule-name>', `Update Enabled Rule`)
  .parse(process.argv);

const validServerOptions = ['rulesPath', 'rulesConfigFile', 'internalIp', 'proxyPort', 'webInterfacePort', 'hocusProxusPath', 'proxyPacFile'];
const validConfigOptions = ['enabledRule', 'listRules', 'listConfigs', 'domain'];
let hasConfigOptions = validConfigOptions.some(option => typeof program[option] !== 'unefined' && program[option]);

validServerOptions.forEach(option => {
  if(program[option]) {
    options[option] = program[option];
  }
});

if(Object.entries(options).length === 0 && options.constructor === Object && !hasConfigOptions) {
  logger.note('Running Hocus Proxus with the default options, for more commands, type hocus-proxus --help.');
}

const proxy = new HocusProxus(options);

if(!hasConfigOptions) {
  return proxy.start();
}

const configPromises = validConfigOptions.map(option => {
  if(program[option]) {
    return new Promise(async (resolve, reject) => {
      try {
        if(option === 'enabledRule' || option === 'domain') {
          return resolve({
            option,
            result: await proxy.updateRuleConfig({ [option]: program[option] })
          });
        }

        resolve({
          option,
          result: await proxy[option]()
        });
      } catch(error) {
        reject(error);
      }
    });
  }
}).filter(option => !!option);

Promise.all(configPromises).then(configsOutput => {
  configsOutput.forEach(config => {
    logger.info(`Output for command "${config.option}":`)
    logger.info(config.result);
  });
}).catch(logger.error);

