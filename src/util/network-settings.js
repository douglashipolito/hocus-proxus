const fs = require("fs-extra");
const lan = require("lan-settings");
const path = require("path");
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
  setProxyPacFile({ proxyPac, domain = 'localhost', ip = '127.0.0.1', port = '8001' }) {
    return new Promise(async (resolve, reject) => {
      try {
        const proxyPacExists = await fs.exists(proxyPac.path);

        if(!proxyPacExists) {
          await fs.copy(path.join(__dirname, '..', 'templates', 'proxy.pac'), proxyPac.path);
        }

        let proxyPacContent = await fs.readFile(proxyPac.path, { encoding: 'utf8' });
        proxyPacContent = proxyPacContent.replace(
          /var ip\s?=\s?"(.+?)"/,
          `var ip="${ip}:${port}"`
        );
        proxyPacContent = proxyPacContent.replace(/var domain\s?=\s?"(.+?)"/, `var domain="${domain}"`);

        await fs.writeFile(proxyPac.path, proxyPacContent);
        resolve(proxyPacContent);
      } catch (error) {
        console.log("===> Proxy Lan Settings: ", error);
        reject(error);
      }
    });
  },
  setAutomaticProxyConfig({ enable, proxyPac, domain, ip, port }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.setProxyPacFile({ proxyPac, domain, ip, port });

        await lan.setSettings({
          autoConfig: enable,
          autoConfigUrl: proxyPac.url
        });

        if (enable) {
          console.log(
            `\n===> Proxy Auto Config enabled and set to ${proxyPac.url}\n`
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
  toggleSystemProxy({ enable, proxyPac, domain, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        if(proxyPac) {
          await this.setAutomaticProxyConfig({ enable, proxyPac, domain, ip, port });
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
  enableSystemProxy({ proxyPac, domain, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.toggleSystemProxy({ enable: true, proxyPac, domain, ip, port, type });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  },
  disableSystemProxy({ proxyPac, domain, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.toggleSystemProxy({ enable: false, proxyPac, domain, ip, port, type });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
};
