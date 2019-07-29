const cheerio = require('cheerio');
const jsesc = require('jsesc');
const _ = require('lodash');
var rules = require('require-all')({
  dirname     :  __dirname + '/rules',
  recursive   : false
});

const beforeSendRequest = [];
const beforeSendResponse = [];

for(rule in rules) {
  if(rules[rule].type === 'beforeSendRequest') {
    beforeSendRequest.push(rules[rule]);
  }

  if(rules[rule].type === 'beforeSendResponse') {
    beforeSendResponse.push(rules[rule]);
  }
}

function* processRules(type, globalResponse = {}, requestDetail, responseDetail) {
  const types = {
    beforeSendRequest,
    beforeSendResponse
  };
  
  let foundRule = null;

  if(types[type]) {
    types[type].some(rule => {
      if(rule.check(requestDetail, responseDetail)) {
        foundRule = rule;
        return true;
      }
    });
  }

  if(foundRule) {
    let resolveData = {};
    
    try {
      resolveData = yield foundRule.resolve(requestDetail, responseDetail);
    } catch(error) {
      return error;
    }

    return _.defaultsDeep(resolveData, globalResponse);
  }

  return globalResponse;
}

module.exports = {
  *beforeSendRequest(requestDetail) {
    // return processRules('beforeSendRequest', {}, requestDetail);
  },
  *beforeSendResponse(requestDetail, responseDetail) {
    const newResponse = Object.assign({}, responseDetail.response);    
    const setCookiesHeader = newResponse.header['Set-Cookie'];

    // Encodes any unicode character
    // This comes from Incapsula
    if(setCookiesHeader && Array.isArray(setCookiesHeader)) {
      newResponse.header['Set-Cookie'] = setCookiesHeader.map(cookie => jsesc(cookie));
    }

    return yield processRules('beforeSendResponse', { response: newResponse }, requestDetail, responseDetail);
  }
};