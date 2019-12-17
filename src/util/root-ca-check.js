/**
 * check if root CA exists and installed
 * will prompt to generate when needed
 */
const co = require("co");
const thunkify = require("thunkify");
const AnyProxy = require("anyproxy");
const certMgr = AnyProxy.utils.certMgr;

function checkRootCAExists() {
  return certMgr.isRootCAFileExists();
}

module.exports = co.wrap(function*() {
  try {
    if (!checkRootCAExists()) {
      console.log("Missing root CA, generating now");
      yield thunkify(certMgr.generateRootCA)();
      yield certMgr.trustRootCA();
    } else {
      const isCATrusted = yield thunkify(certMgr.ifRootCATrusted)();
      if (!isCATrusted) {
        console.log("ROOT CA NOT INSTALLED YET");
        yield certMgr.trustRootCA();
      }
    }
  } catch (e) {
    console.error(e);
  }
});