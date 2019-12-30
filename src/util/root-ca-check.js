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

class RootCACheck {
  constructor(server) {
    this.server = server;
  }

  check() {

    return co.wrap(function*() {
      try {
        if (!checkRootCAExists()) {
          this.server.logger.info("Missing root CA, generating now");
          yield thunkify(certMgr.generateRootCA)();
          yield certMgr.trustRootCA();
        } else {
          const isCATrusted = yield thunkify(certMgr.ifRootCATrusted)();
          if (!isCATrusted) {
            this.server.logger.error("ROOT CA NOT INSTALLED YET");
            yield certMgr.trustRootCA();
          }
        }
      } catch (e) {
        this.server.logger.error(e);
      }
    }.bind(this));
  }
}

module.exports = RootCACheck;
