const lan = require("lan-settings");
const systemWideProxy = require("./system-wide-proxy");
const ip = require("ip");

module.exports = {
  getIpAddress() {
    return ip.address();
  },
  setSystemWideProxy({ enable, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        if(enable) {
          systemWideProxy.enableGlobalProxy(ip, port, type);
        } else {
          systemWideProxy.disableGlobalProxy(type);
        }

        resolve()
      } catch(error) {
        reject(error);
      }
    });
  },
  setAutomaticProxyConfig({ enable, proxyPac }) {
    return new Promise(async (resolve, reject) => {
      try {
        await lan.setSettings({
          autoConfig: enable,
          autoConfigUrl: proxyPac
        });

        if (enable) {
          console.log(
            `\n===> Proxy Auto Config enabled and set to ${proxyPac}\n`
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
  },
  toggleSystemProxy({ enable, proxyPac, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        if(proxyPac) {
          await this.setAutomaticProxyConfig({ enable,  proxyPac });
        } else {
          await this.setSystemWideProxy({ enable, ip, port, type });
        }

        resolve();
      } catch (error) {
        console.log("===> Proxy Lan Settings: ", error);
        reject(error);
      }
    });
  },
  enableSystemProxy({ proxyPac, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.toggleSystemProxy({ enable: true, proxyPac, ip, port, type });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  },
  disableSystemProxy({ proxyPac, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.toggleSystemProxy({ enable: false, proxyPac, ip, port, type });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
};
