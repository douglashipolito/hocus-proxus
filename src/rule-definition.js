const jsesc = require('jsesc');
const _ = require("lodash");

module.exports = async function(serverOptions, ruleInstance) {
  return {
    async preprocessors() {
      return await ruleInstance.processRules({ serverOptions, type: "preprocessors" });
    },
    async beforeDealHttpsRequest(requestDetail) {
      const shouldConsiderHTTPS = await ruleInstance.processRules({
        serverOptions,
        type: "beforeDealHttpsRequest",
        requestDetail
      });;

      if(!shouldConsiderHTTPS || typeof shouldConsiderHTTPS.data === 'undefined') {
        return true;
      }

      return shouldConsiderHTTPS.data;
    },
    async beforeSendRequest(requestDetail) {
      return await ruleInstance.processRules({
        serverOptions,
        type: "beforeSendRequest",
        requestDetail
      });
    },
    async beforeSendResponse(requestDetail, responseDetail) {
      const processedRuleData = await ruleInstance.processRules({
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
