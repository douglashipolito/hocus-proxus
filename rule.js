const _ = require('lodash');
var rules = require('require-all')({
  dirname     :  __dirname + '/rules',
  recursive   : false
});

const beforeSendRequest = [];
const beforeSendResponse = [];

for(rule in rules) {
  if(rules[rule].beforeSendRequest) {
    beforeSendRequest.push(rules[rule].beforeSendRequest);
  }

  if(rules[rule].beforeSendResponse) {
    beforeSendResponse.push(rules[rule].beforeSendResponse);
  }
}

async function processRules(type, requestDetail, responseDetail) {
  const types = {
    beforeSendRequest,
    beforeSendResponse
  };
  let globalResponse = {};
  let foundRule = null;

  if(types[type]) {
    const globalRulesData = types[type].filter(rule => rule.global).map(rule => {
      return new Promise(async function(resolve) {
        _.defaultsDeep(globalResponse, await rule.resolve({requestDetail, responseDetail}));
        resolve();
      });
    });
    await Promise.all(globalRulesData);

    types[type].filter(rule => !rule.global).some(rule => {
      if(rule.check({requestDetail, responseDetail})) {
        foundRule = rule;
        return true;
      }
    });
  }

  if(foundRule) {
    let resolveData = {};
    
    try {
      resolveData = await foundRule.resolve({requestDetail, responseDetail});
    } catch(error) {
      return error;
    }
    
    return _.defaultsDeep(resolveData, globalResponse);
  }

  return globalResponse;
}

module.exports = {
  async beforeSendRequest(requestDetail) {
    return await processRules('beforeSendRequest', requestDetail);
  },
  async beforeSendResponse(requestDetail, responseDetail) {
    return await processRules('beforeSendResponse', requestDetail, responseDetail);
  }
};