const child_process = require("child_process");
const fs = require("fs-extra");
const path = require("path");
const promisify = require("util").promisify;
const exec = promisify(child_process.exec);
const ip = require("ip");
let displayedAutoProxySupportMessage = false;

class NetworkSettings {
  constructor(server) {
    this.server = server;
  }

  getIpAddress() {
    return ip.address();
  }

  setProxyPacFile({
    proxyPac,
    domain = "localhost",
    ip = "127.0.0.1",
    port = "8001"
  }) {
    return new Promise(async (resolve, reject) => {
      try {
        const proxyPacExists = await fs.exists(proxyPac.path);

        if (!proxyPacExists) {
          await fs.copy(
            path.join(__dirname, "..", "templates", "proxy.pac"),
            proxyPac.path
          );
        }

        let proxyPacContent = await fs.readFile(proxyPac.path, {
          encoding: "utf8"
        });
        proxyPacContent = proxyPacContent.replace(
          /var ip\s?=\s?"(.+?)"/,
          `var ip="${ip}:${port}"`
        );
        proxyPacContent = proxyPacContent.replace(
          /var domain\s?=\s?"(.+?)"/,
          `var domain="${domain}"`
        );

        await fs.writeFile(proxyPac.path, proxyPacContent);
        resolve(proxyPacContent);
      } catch (error) {
        this.server.logger.error(" Proxy Lan Settings: ", error);
        reject(error);
      }
    });
  }

  setChromeProxyPolicy(enable, proxyPac) {
    const chromePolicyFile = "hocus-proxy-policy.json";
    const chromePolicyPath = {
      linux: "/etc/opt/chrome/policies/managed"
    };

    const ProxyPolicy = {
      ProxyMode: "pac_script",
      ProxyPacUrl: proxyPac.url
    };

    return new Promise(async (resolve, reject) => {
      if (chromePolicyPath[process.platform]) {
        try {
          const currentOSChromePolicyPath = chromePolicyPath[process.platform];
          const policyFullPath = path.join(
            currentOSChromePolicyPath,
            chromePolicyFile
          );

          if (!(await fs.exists(currentOSChromePolicyPath))) {
            this.server.logger.info(
              `Creating Chrome Policy managed folder at ${currentOSChromePolicyPath}`
            );
            await exec(`sudo mkdir -p ${currentOSChromePolicyPath}`);
          }

          if (enable) {
            this.server.logger.info(
              `Enabling Proxy Policy in the file: ${policyFullPath}`
            );
            await exec(
              `echo '${JSON.stringify(
                ProxyPolicy
              )}' | sudo tee ${policyFullPath}`
            );
          } else {
            if (await fs.exists(policyFullPath)) {
              this.server.logger.info(
                `Removing Proxy Policy file: ${ProxyPolicy.ProxyPacUrl}`
              );
              await exec(`sudo rm ${policyFullPath}`);
            }
          }
          resolve();
        } catch (error) {
          reject(error);
        }
      } else {
        reject("Platform not supported");
      }
    });
  }

  setAutomaticProxyConfig({ enable, proxyPac, domain, ip, port }) {
    return new Promise(async (resolve, reject) => {
      let supportsAutoProxy = true;

      try {
        await this.setProxyPacFile({ proxyPac, domain, ip, port });
      } catch (error) {
        return reject(error);
      }

      try {
        const lan = require("lan-settings");

        await lan.setSettings({
          autoConfig: enable,
          autoConfigUrl: proxyPac.url
        });

        if (enable) {
          this.server.logger.success(
            `Proxy Auto Config enabled and set to ${proxyPac.url}`
          );
        } else {
          this.server.logger.success(`Proxy Auto Config disabled`);
        }

        return resolve();
      } catch (error) {
        if (!displayedAutoProxySupportMessage) {
          this.server.logger.error(
            `We can't set the Auto Config URL(Proxy Pac) for your system. Trying to set through Google Chrome policies`
          );
          this.server.logger.error(
            `This is the Proxy Pac file url if you want to set this manually: ${proxyPac.url}`
          );
        }
        supportsAutoProxy = false;
        displayedAutoProxySupportMessage = true;
      }

      if (!supportsAutoProxy) {
        try {
          await this.setChromeProxyPolicy(enable, proxyPac);
          resolve();
        } catch (error) {
          reject(error);
        }
      }
    });
  }

  toggleSystemProxy({ enable, proxyPac, domain, ip, port }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.setAutomaticProxyConfig({
          enable,
          proxyPac,
          domain,
          ip,
          port
        });
        resolve();
      } catch (error) {
        this.server.logger.error(" Proxy Lan Settings: ", error);
        reject(error);
      }
    });
  }

  enableSystemProxy({ proxyPac, domain, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.toggleSystemProxy({
          enable: true,
          proxyPac,
          domain,
          ip,
          port,
          type
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  disableSystemProxy({ proxyPac, domain, ip, port, type }) {
    return new Promise(async (resolve, reject) => {
      try {
        await this.toggleSystemProxy({
          enable: false,
          proxyPac,
          domain,
          ip,
          port,
          type
        });
        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }
}

module.exports = NetworkSettings;
