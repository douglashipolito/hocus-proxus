process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const os = require("os");
const co = require("co");
const path = require("path");
const AnyProxy = require("anyproxy");
const _ = require("lodash");
const Rule = require("./rule");
const ruleDefinition = require("./rule-definition");
const webInterfaceRoutes = require("./web-interface-routes");
const rootCACheck = require("./util/root-ca-check");
const networkSettings = require("./util/network-settings");
const exitHook = require("async-exit-hook");

class HocusProxus {
  constructor(hocusProxusOptions = {}) {
    const internalIp = this.getInternalIp();
    const hocusProxusUserPath = path.join(os.homedir(), "hocus-proxus");
    const rulesPath = path.join(hocusProxusUserPath, "rules");

    const proxyConfig = {
      proxyPort: 8001,
      webinterfacePort: 8002,
      domain: "example.com"
    };

    const defaultOptions = {
      isServerRunning: false,
      proxyServer: {},
      rulesPath,
      rulesConfigFile: path.join(rulesPath, "config.json"),
      exampleRulePath: path.join(rulesPath, "example-rule"),
      internalIp,
      proxyPacFile: `http://${internalIp}:${proxyConfig.webinterfacePort}/proxy.pac`,
      proxyPacFilePath: path.join(hocusProxusUserPath, "proxy.pac"),
      isProxyEnabled: true,
      config: proxyConfig
    };

    this.hocusProxusOptions = _.defaultsDeep(
      defaultOptions,
      hocusProxusOptions
    );
    this.rule = new Rule(this.hocusProxusOptions);

    process
      .on("unhandledRejection", (reason, p) => {
        console.error(reason, "Unhandled Rejection at Promise", p);
      })
      .on("uncaughtException", err => {
        console.error(err, "Uncaught Exception thrown");
        process.exit(1);
      });
  }

  start() {
    return new Promise(async (resolve, reject) => {
      try {
        this.ruleDefinition = await this.setRules(this.hocusProxusOptions);
        const caStatus = await this.getCAStatus();

        if (!caStatus.exist && !caStatus.trusted) {
          await this.rootCACheck();
        }

        await this.enableSystemProxy();
        console.log(
          `===> Proxy Options:
          - Status: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.config.webinterfacePort}/proxy-enabled
          - Enable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.config.webinterfacePort}/proxy-enabled/true
          - Disable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.config.webinterfacePort}/proxy-enabled/false\n`
        );

        await this.startProxyServer();

        // Setting custom routes for the Web Interface
        await this.setWebInterfaceRoutes(this.hocusProxusOptions);

        // Run Preprocessors
        await this.ruleDefinition.preprocessors();

        //On Exit
        exitHook(async callback => {
          console.log("disabling proxy auto config");
          try {
            await this.disableSystemProxy();
            console.log("pausing server...");
            this.hocusProxusOptions.proxyServer.close();
            await new Promise(resolve => setTimeout(resolve, 200));
            callback();
          } catch (error) {
            callback();
          }
        });

        resolve();
      } catch (error) {
        reject(error);
      }
    });
  }

  startProxyServer() {
    return new Promise((resolve, reject) => {
      this.serverOptions = {
        port: this.hocusProxusOptions.config.proxyPort,
        rule: this.ruleDefinition,
        webInterface: {
          enable: true,
          webPort: this.hocusProxusOptions.config.webinterfacePort
        },
        forceProxyHttps: true
      };

      this.hocusProxusOptions.proxyServer = new AnyProxy.ProxyServer(
        this.serverOptions
      );
      this.hocusProxusOptions.proxyServer.on("ready", resolve);
      this.hocusProxusOptions.proxyServer.on("error", reject);
      this.hocusProxusOptions.proxyServer.start();
      this.hocusProxusOptions.isServerRunning = true;
    });
  }

  async rootCACheck() {
    return await rootCACheck();
  }

  getCAStatus() {
    return co.wrap(function*(val) {
      return yield AnyProxy.utils.certMgr.getCAStatus();
    });
  }

  async toggleSystemProxy(enable, { proxyPac, domain, ip, port } = {}) {
    proxyPac = typeof proxyPac !== 'undefined' ? proxyPac : {
      url: this.hocusProxusOptions.proxyPacFile,
      path: this.hocusProxusOptions.proxyPacFilePath
    };
    domain = domain ? domain : this.hocusProxusOptions.config.domain;
    ip = ip ? ip : this.hocusProxusOptions.internalIp;
    port = port ? port : this.hocusProxusOptions.config.proxyPort;

    return networkSettings.toggleSystemProxy({
      enable,
      proxyPac,
      domain,
      ip,
      port
    });
  }

  async enableSystemProxy(options) {
    return this.toggleSystemProxy(true, options);
  }

  async disableSystemProxy(options) {
    return this.toggleSystemProxy(false, options);
  }

  async setWebInterfaceRoutes(hocusProxusOptions) {
    // Setting custom routes for the Web Interface
    return await webInterfaceRoutes(hocusProxusOptions);
  }

  async setRules(hocusProxusOptions) {
    try {
      await this.rule.setRules();
    } catch (error) {
      console.log("Error on setting the rules", error);
      process.exit(0);
    }

    return ruleDefinition(hocusProxusOptions, this.rule);
  }

  updateRuleConfig(config = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const previousRulesConfig = await this.rule.getRulesConfig();
        const newConfig = await this.rule.updateRuleConfig(config);
        if(previousRulesConfig.domain !== newConfig.domain) {
          this.hocusProxusOptions.config.domain = newConfig.domain;

          await networkSettings.setProxyPacFile({
            proxyPac: {
              url: this.hocusProxusOptions.proxyPacFile,
              path: this.hocusProxusOptions.proxyPacFilePath
            },
            domain: this.hocusProxusOptions.config.domain,
            ip: this.hocusProxusOptions.internalIp,
            port: this.hocusProxusOptions.config.proxyPort
          });
        }
        resolve(newConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  getInternalIp() {
    return networkSettings.getIpAddress();
  }
}

module.exports = HocusProxus;
