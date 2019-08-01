const _ = require("lodash");
var rules = require("require-all")({
  dirname: `${__dirname}/rules`,
  recursive: false
});

const beforeSendRequest = [];
const beforeSendResponse = [];

for (ruleKey in rules) {
  const rule = rules[ruleKey];
  if (rule.modules && Array.isArray(rule.modules)) {
    rule.modules.forEach((ruleModule, index) => {
      rules[`${ruleKey}-module-${index}`] = ruleModule;
    });
    delete rules[ruleKey];
  }
}

for (ruleKey in rules) {
  const rule = rules[ruleKey];

  if (rule.beforeSendRequest) {
    beforeSendRequest.push(rule.beforeSendRequest);
  }

  if (rule.beforeSendResponse) {
    beforeSendResponse.push(rule.beforeSendResponse);
  }
}

async function processRules(type, requestDetail, responseDetail) {
  const types = {
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
              await rule.resolve({ requestDetail, responseDetail })
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
            ruleData = await rule.resolve({ requestDetail, responseDetail });
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

module.exports = {
  async beforeSendRequest(requestDetail) {
    return await processRules("beforeSendRequest", requestDetail);
  },
  async beforeSendResponse(requestDetail, responseDetail) {
    return await processRules(
      "beforeSendResponse",
      requestDetail,
      responseDetail
    );
  }
};
