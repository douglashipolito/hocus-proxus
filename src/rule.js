const fs = require('fs-extra');
const jsesc = require('jsesc');
const promisify = require('util').promisify;
const path = require('path');
const _ = require("lodash");

class Rule {
  constructor(serverOptions) {
    this.serverOptions = serverOptions;
    this.beforeSendRequest = [];
    this.beforeSendResponse = [];
    this.preprocessors = [];
  }

  loadRules() {
    return new Promise(async (resolve, reject) => {
      const rulesPath = this.serverOptions.rulesPath;
      const rules = {};
      const readDir = promisify(fs.readdir);

      try {
        const ruleConfig = await fs.readJSON(this.serverOptions.rulesConfigFile);
        const allRules = await readDir(rulesPath);

        const foundRule = allRules.some(ruleName => {
          const rulePath = path.join(rulesPath, ruleName);

          if(fs.lstatSync(rulePath).isDirectory()) {
            if(ruleName === ruleConfig.enabledRule) {
              rules[ruleName] = require(rulePath);
              this.serverOptions.config.domain = ruleConfig.domain;
              console.log(`===> Loading rules "${ruleName}" from "${rulePath}"`);
              console.log(`===> Proxying the domain "${ruleConfig.domain}`);
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

  setRules() {
    return new Promise(async (resolve, reject) => {
        const serverOptions = this.serverOptions;
        const rulesConfigFile = serverOptions.rulesConfigFile;
        const exampleRulePath = serverOptions.exampleRulePath;

      try {
        await fs.ensureDir(serverOptions.rulesPath);
        const configExists = await fs.exists(rulesConfigFile);
        const exampleRuleExists = await fs.exists(exampleRulePath);

        if(!configExists) {
          await fs.copy(path.join(__dirname, 'templates', 'config.json'), rulesConfigFile);
        }

        if(!exampleRuleExists) {
          await fs.copy(path.join(__dirname, 'templates', 'example-rule'), exampleRulePath);
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
          await Promise.all(
            types[type]
              .filter(rule => rule.global)
              .map(rule => {
                return new Promise(async resolve => {
                  _.defaultsDeep(
                    globalResponse,
                    await rule.resolve({
                      serverOptions,
                      requestDetail,
                      responseDetail
                    })
                  );
                  resolve();
                });
              })
          );

          foundRules = await Promise.all(
            types[type]
              .filter(rule => !rule.global)
              .map(rule => {
                return new Promise(async resolve => {
                  const shouldResolve = await rule.shouldResolve({
                    requestDetail,
                    responseDetail
                  });

                  if (shouldResolve) {
                    return resolve(rule);
                  }

                  resolve();
                });
              })
          );
        } catch(error) {
          return reject(error);
        }
      }

      if (foundRules.length) {
        let resolveData = {};

        try {
          await Promise.all(
            foundRules
              .filter(rule => !!rule)
              .map(async rule => {
                let ruleData = {};

                try {
                  ruleData = await rule.resolve({
                    serverOptions,
                    requestDetail,
                    responseDetail
                  });
                } catch (error) {
                  throw new Error(error);
                }

                _.defaultsDeep(resolveData, ruleData);
              })
          );
        } catch(error) {
          reject(error);
        }

        return resolve(_.defaultsDeep(resolveData, globalResponse));
      }

      resolve(globalResponse);
    });
  }
}

module.exports = async function(serverOptions) {
  const rule = new Rule(serverOptions);

  try {
    await rule.setRules();
  } catch(error) {
    console.log('Error on setting the rules', error);
    process.exit(0);
  }

  return {
    async preprocessors() {
      return await rule.processRules({ serverOptions, type: "preprocessors" });
    },
    async beforeSendRequest(requestDetail) {
      return await rule.processRules({
        serverOptions,
        type: "beforeSendRequest",
        requestDetail
      });
    },
    async beforeSendResponse(requestDetail, responseDetail) {
      const processedRuleData = await rule.processRules({
        serverOptions,
        type: "beforeSendResponse",
        requestDetail,
        responseDetail
      });

      _.defaultsDeep(processedRuleData, responseDetail);
      const setCookiesHeader = processedRuleData.response.header["Set-Cookie"];

      // Encodes any unicode character
      // This comes from Incapsula
      if (setCookiesHeader && Array.isArray(setCookiesHeader)) {
        processedRuleData.response.header["Set-Cookie"] = setCookiesHeader.map(cookie =>
          jsesc(cookie)
        );
      }

      return processedRuleData;
    }
  };
};
