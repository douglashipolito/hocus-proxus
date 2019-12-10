const lan = require("lan-settings");
const ip = require("ip");

module.exports = {
  getIpAddress() {
    return ip.address();
  },
  setAutomaticProxy(enable, proxyPacFile) {
    return new Promise(async (resolve, reject) => {
      try {
        await lan.setSettings({
          autoConfig: enable,
          autoConfigUrl: proxyPacFile
        });

        if (enable) {
          console.log(
            `\n===> Proxy Auto Config enabled and set to ${proxyPacFile}\n`
          );
        } else {
          console.log(`\n===> Proxy Auto Config disabled\n`);
        }

        resolve();
      } catch (error) {
        console.log("===> Proxy Lan Settings: ", error);
        reject(error);
      }
    });
  }
};
