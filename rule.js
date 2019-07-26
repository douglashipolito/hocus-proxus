const cheerio = require('cheerio');
const jsesc = require('jsesc');
var rules = require('require-all')({
  dirname     :  __dirname + '/rules',
  recursive   : false
});

const beforeSendRequestRules = [];
const beforeSendResponse = [];

for(rule in rules) {
  if(rules[rule].beforeSendRequest) {
    beforeSendRequestRules.push(rules[rule].beforeSendRequest);
  }

  if(rules[rule].beforeSendResponse) {
    beforeSendResponse.push(rules[rule].beforeSendResponse);
  }
}

module.exports = {
  *beforeSendRequest(requestDetail) {
    
  },
  *beforeSendResponse(requestDetail, responseDetail) {
    const newResponse = Object.assign({}, responseDetail.response);    
    const setCookiesHeader = newResponse.header['Set-Cookie'];

    // Encodes any unicode character
    // This comes from Incapsula
    if(setCookiesHeader && Array.isArray(setCookiesHeader)) {
      newResponse.header['Set-Cookie'] = setCookiesHeader.map(cookie => jsesc(cookie));
    }

    return {
      response: newResponse
    };
  }
};