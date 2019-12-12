const path = require('path');
const _ = require("lodash");

var rules = require("require-all")({
  dirname: path.join(__dirname, '..', 'rules'),
  recursive: false
});

const beforeSendRequest = [];
const beforeSendResponse = [];
const preprocessors = [];

for (ruleKey in rules) {
  const rule = rules[ruleKey];

  if (rule.preprocessors && Array.isArray(rule.preprocessors)) {
    rule.preprocessors.forEach((ruleModule, index) => {
      rules[`${ruleKey}-preprocessor-${index}`] = ruleModule;
    });
    delete rules[ruleKey];
  }

  if (rule.routes && Array.isArray(rule.routes)) {
    rule.routes.forEach((ruleModule, index) => {
      rules[`${ruleKey}-routes-${index}`] = ruleModule;
    });
    delete rules[ruleKey];
  }
}

for (ruleKey in rules) {
  const rule = rules[ruleKey];

  if (rule.preprocessors) {
    preprocessors.push(rule.preprocessors);
  }

  if (rule.beforeSendRequest) {
    beforeSendRequest.push(rule.beforeSendRequest);
  }

  if (rule.beforeSendResponse) {
    beforeSendResponse.push(rule.beforeSendResponse);
  }
}

async function processRules({
  serverOptions,
  type,
  requestDetail,
  responseDetail
}) {
  const types = {
    preprocessors,
    beforeSendRequest,
    beforeSendResponse
  };
  let globalResponse = {};
  let foundRules = [];

  if (types[type]) {
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
  }

  if (foundRules.length) {
    let resolveData = {};

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

    return _.defaultsDeep(resolveData, globalResponse);
  }

  return globalResponse;
}

module.exports = function(serverOptions) {
  return {
    async preprocessors() {
      return await processRules({ serverOptions, type: "preprocessors" });
    },
    async beforeSendRequest(requestDetail) {
      return await processRules({
        serverOptions,
        type: "beforeSendRequest",
        requestDetail
      });
    },
    async beforeSendResponse(requestDetail, responseDetail) {
      return await processRules({
        serverOptions,
        type: "beforeSendResponse",
        requestDetail,
        responseDetail
      });
    }
  };
};
