const fs = require('fs-extra');
const promisify = require('util').promisify;
const path = require('path');
const _ = require("lodash");
const readDir = promisify(fs.readdir);

class Rule {
  constructor(serverOptions, server) {
    this.serverOptions = serverOptions;
    this.server = server;
    this.beforeSendRequest = [];
    this.beforeSendResponse = [];
    this.preprocessors = [];
  }

  listRules() {
    return new Promise(async (resolve, reject) => {
      const rulesPath = this.serverOptions.rulesPath;
      const rules = {};

      try {
        const rulesPathExists = await fs.exists(rulesPath);
        if(!rulesPathExists) {
          return reject('You have no rules set yet. Please run the server once to create the basic rules.');
        }

        let allRules = await readDir(rulesPath);
        allRules = allRules.filter(ruleName => {
          const rulePath = path.join(rulesPath, ruleName);

          if(fs.lstatSync(rulePath).isDirectory()) {
            rules[ruleName] = rulePath;
            return true;
          }
        });

        resolve(rules);
      } catch(error) {
        reject(error);
      }
    });
  }

  getRulesConfig() {
    return new Promise(async (resolve, reject) => {
      const serverOptions = this.serverOptions;
      const rulesConfigFile = serverOptions.rulesConfigFile;

      try {
        resolve(await fs.readJSON(rulesConfigFile));
      } catch(error) {
        reject(error);
      }
    });
  }

  updateRuleConfig(config = {}) {
    return new Promise(async (resolve, reject) => {
      const serverOptions = this.serverOptions;
      const rulesConfigFile = serverOptions.rulesConfigFile;

      try {
        await this.ensureBaseConfig();
        const allRulesNames = Object.keys(await this.listRules());
        const currentConfig = await fs.readJSON(rulesConfigFile);
        _.defaultsDeep(config, currentConfig);

        if(!allRulesNames.includes(config.enabledRule)) {
          return reject(`Rule "${config.enabledRule}" doesn't exist in the existing rules. Please provide a valid rule:\n\n${allRulesNames.join('\n')}`);
        }

        await fs.writeJSON(rulesConfigFile, config, { spaces: 2 });
        resolve(config);
      } catch(error) {
        return reject(error);
      }
    });
  }

  loadRules() {
    return new Promise(async (resolve, reject) => {
      const rulesPath = this.serverOptions.rulesPath;
      const rules = {};

      try {
        const ruleConfig = await fs.readJSON(this.serverOptions.rulesConfigFile);
        const allRules = await readDir(rulesPath);

        const foundRule = allRules.some(ruleName => {
          const rulePath = path.join(rulesPath, ruleName);

          if(fs.lstatSync(rulePath).isDirectory()) {
            if(ruleName === ruleConfig.enabledRule) {
              rules[ruleName] = require(rulePath);
              this.serverOptions.domain = ruleConfig.domain;
              console.log(`===> Loading rules "${ruleName}" from "${rulePath}"`);
              return true;
            }
          }
        });

        if(!foundRule) {
          return reject(`No Rule found with the name "${ruleConfig.enabledRule}", please review the configs at "${this.serverOptions.rulesConfigFile}"`);
        }

        resolve(rules);
      } catch(error) {
        reject(error);
      }
    });
  }

  ensureBaseConfig() {
    return new Promise(async (resolve, reject) => {
      const serverOptions = this.serverOptions;
      const rulesConfigFile = serverOptions.rulesConfigFile;

      try {
        const configExists = await fs.exists(rulesConfigFile);

        if(!configExists) {
          await fs.copy(path.join(__dirname, 'templates', 'config.json'), rulesConfigFile);
        }

        const config = await fs.readJSON(rulesConfigFile);
        config.domain = serverOptions.domain;

        if(serverOptions.enabledRule) {
          config.enabledRule = serverOptions.enabledRule;
        }

        await fs.writeJSON(rulesConfigFile, config, { spaces: 2 });
        resolve(true);
      } catch(error) {
        return reject(error);
      }
    });
  }

  ensureBaseExampleRule() {
    return new Promise(async (resolve, reject) => {
      const serverOptions = this.serverOptions;
        const exampleRulePath = serverOptions.exampleRulePath;

      try {
        const exampleRuleExists = await fs.exists(exampleRulePath);

        if(!exampleRuleExists) {
          await fs.copy(path.join(__dirname, 'templates', 'example-rule'), exampleRulePath);
        }

        resolve(true);
      } catch(error) {
        return reject(error);
      }
    });
  }

  setRules() {
    return new Promise(async (resolve, reject) => {
        const serverOptions = this.serverOptions;

      try {
        await fs.ensureDir(serverOptions.rulesPath);
        await this.ensureBaseConfig();

        if(!serverOptions.enabledRule) {
          await this.ensureBaseExampleRule();
        }

        this.rules = await this.loadRules();
      } catch(error) {
        return reject(error);
      }

      for (const ruleKey in this.rules) {
        const rule = this.rules[ruleKey];

        if (rule.preprocessors && Array.isArray(rule.preprocessors)) {
          rule.preprocessors.forEach((ruleModule, index) => {
            this.rules[`${ruleKey}-preprocessor-${index}`] = ruleModule;
          });
          delete this.rules[ruleKey];
        }

        if (rule.routes && Array.isArray(rule.routes)) {
          rule.routes.forEach((ruleModule, index) => {
            this.rules[`${ruleKey}-routes-${index}`] = ruleModule;
          });
          delete this.rules[ruleKey];
        }
      }

      for (const ruleKey in this.rules) {
        const rule = this.rules[ruleKey];

        if (rule.preprocessors) {
          this.preprocessors.push(rule.preprocessors);
        }

        if (rule.beforeSendRequest) {
          this.beforeSendRequest.push(rule.beforeSendRequest);
        }

        if (rule.beforeSendResponse) {
          this.beforeSendResponse.push(rule.beforeSendResponse);
        }
      }

      resolve();
    });
  }

  processRules({
    serverOptions,
    type,
    requestDetail,
    responseDetail
  }) {
    return new Promise(async (resolve, reject) => {
      const types = {
        preprocessors: this.preprocessors,
        beforeSendRequest: this.beforeSendRequest,
        beforeSendResponse: this.beforeSendResponse
      };
      let globalResponse = {};
      let foundRules = [];

      if (types[type]) {
        try {
          const globalRules = types[type].filter(rule => rule.global);
          for await (const rule of globalRules) {
            _.defaultsDeep(
              globalResponse,
              await rule.resolve({
                server: this.server,
                serverOptions,
                requestDetail,
                responseDetail
              })
            );
          }

          const nonRules = types[type].filter(rule => !rule.global);
          for await (const rule of nonRules) {
            const shouldResolve = await rule.shouldResolve({
              requestDetail,
              responseDetail
            });

            if (shouldResolve) {
              foundRules.push(rule);
            }
          }

        } catch(error) {
          return reject(error);
        }
      }

      if (foundRules.length) {
        let resolveData = {};

        try {
          const allRules = foundRules.filter(rule => !!rule);
          for await (const rule of allRules) {
            let ruleData = {};

            try {
              ruleData = await rule.resolve({
                server: this.server,
                serverOptions,
                requestDetail,
                responseDetail
              });
            } catch (error) {
              throw new Error(error);
            }

            _.defaultsDeep(resolveData, ruleData);
          }
        } catch(error) {
          reject(error);
        }

        return resolve(_.defaultsDeep(resolveData, globalResponse));
      }

      resolve(globalResponse);
    });
  }
}

module.exports = Rule;
