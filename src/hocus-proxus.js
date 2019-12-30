process.binding(
  "http_parser"
).HTTPParser = require("http-parser-js").HTTPParser;

const os = require("os");
const co = require("co");
const path = require("path");
const { Signale } = require('signale');
const AnyProxy = require("anyproxy");
const _ = require("lodash");
const Rule = require("./rule");
const ruleDefinition = require("./rule-definition");
const webInterfaceRoutes = require("./web-interface-routes");
const RootCACheck = require("./util/root-ca-check");
const NetworkSettings = require("./util/network-settings");
const exitHook = require("async-exit-hook");
const qrcode = require('qrcode-terminal');

class HocusProxus {
  constructor(hocusProxusOptions = {}) {
    const logScope = 'hoxus-proxus';
    this.logger = new Signale({
      scope: logScope
    });

    this.logger.interactive = () => {
      return new Signale({
        scope: logScope,
        interactive: true
      });
    };

    this.Signale = Signale;

    this.networkSettings = new NetworkSettings(this);
    this.rootCACheck = new RootCACheck(this);

    const internalIp = this.getInternalIp();
    const hocusProxusUserPath = hocusProxusOptions.hocusProxusUserPath || path.join(os.homedir(), "hocus-proxus");
    const rulesPath = hocusProxusOptions.rulesPath || path.join(hocusProxusUserPath, "rules");
    const webInterfacePort = 8002;

    this.isServerRunning = true;
    this.isProxyEnabled = true;
    this.proxyServer = {};

    this.hocusProxusOptions = _.defaultsDeep(hocusProxusOptions,
      {
        debug: false,
        hocusProxusUserPath,
        proxyPort: 8001,
        webInterfacePort,
        domain: "example.com",
        rulesPath,
        rulesConfigFile: path.join(hocusProxusUserPath, "rules-config.json"),
        exampleRulePath: path.join(rulesPath, "example-rule"),
        enabledRule: null,
        internalIp,
        proxyPacFile: `http://${internalIp}:${webInterfacePort}/proxy.pac`,
        proxyPacFilePath: path.join(hocusProxusUserPath, "proxy.pac")
      }
    );

    this.rule = new Rule(this.hocusProxusOptions, this);

    process
      .on("unhandledRejection", (reason, p) => {
        this.logger.error(reason, "Unhandled Rejection at Promise", p);
      })
      .on("uncaughtException", err => {
        this.logger.error(err, "Uncaught Exception thrown");
        process.exit(1);
      });
  }

  start() {
    return new Promise(async (resolve, reject) => {
      try {
        this.ruleDefinition = await this.setRules(this.hocusProxusOptions);
        const caStatus = await this.getCAStatus();

        if (!caStatus.exist && !caStatus.trusted) {
          await this.rootCACheck.check();
        }

        await this.startProxyServer();

        // Setting custom routes for the Web Interface
        await this.setWebInterfaceRoutes();

        // Run Preprocessors
        await this.ruleDefinition.preprocessors();

        await this.enableSystemProxy();

        this.logger.info(`Proxying the domain "${this.hocusProxusOptions.domain}`);
        this.logger.info(
          `Proxy Options:
          - Status: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/proxy-enabled
          - Enable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/proxy-enabled/true
          - Disable: http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/proxy-enabled/false`
        );

        try {
          const downloadCertQRCode = await this.printQRCode(`http://${this.hocusProxusOptions.internalIp}:${this.hocusProxusOptions.webInterfacePort}/downloadCrt`);
          this.logger.info(
            `QR CODE - Use the following QR Code in your cell phone to download the certificate and trust it:`
          );
          console.log(downloadCertQRCode);
        } catch(error) {
          this.logger.error('An Error has been found while Hocus Proxus was trying to generate the QR CODE. However your proxy will start normally.');
          this.logger.error('This is the error.', error);
        }

        //On Exit
        exitHook(async callback => {
          this.logger.info("disabling proxy auto config");
          try {
            await this.disableSystemProxy();
            this.logger.info("pausing server...");
            this.proxyServer.close();
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
        port: this.hocusProxusOptions.proxyPort,
        rule: this.ruleDefinition,
        webInterface: {
          enable: true,
          webPort: this.hocusProxusOptions.webInterfacePort
        },
        forceProxyHttps: true,
        silent: !this.hocusProxusOptions.debug
      };

      this.proxyServer = new AnyProxy.ProxyServer(
        this.serverOptions
      );
      this.proxyServer.on("ready", resolve);
      this.proxyServer.on("error", reject);
      this.proxyServer.start();
      this.isServerRunning = true;
    });
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
    domain = domain ? domain : this.hocusProxusOptions.domain;
    ip = ip ? ip : this.hocusProxusOptions.internalIp;
    port = port ? port : this.hocusProxusOptions.proxyPort;

    return this.networkSettings.toggleSystemProxy({
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

  async setWebInterfaceRoutes() {
    // Setting custom routes for the Web Interface
    return await webInterfaceRoutes(this);
  }

  async setRules(hocusProxusOptions) {
    try {
      await this.rule.setRules();
    } catch (error) {
      this.logger.error("Error on setting the rules", error);
      process.exit(0);
    }

    return ruleDefinition(hocusProxusOptions, this.rule);
  }

  listRules() {
    return this.rule.listRules();
  }

  updateRuleConfig(config = {}) {
    return new Promise(async (resolve, reject) => {
      try {
        const previousRulesConfig = await this.rule.getRulesConfig();
        const newConfig = await this.rule.updateRuleConfig(config);
        if(previousRulesConfig.domain !== newConfig.domain) {
          this.hocusProxusOptions.domain = newConfig.domain;

          await this.networkSettings.setProxyPacFile({
            proxyPac: {
              url: this.hocusProxusOptions.proxyPacFile,
              path: this.hocusProxusOptions.proxyPacFilePath
            },
            domain: this.hocusProxusOptions.domain,
            ip: this.hocusProxusOptions.internalIp,
            port: this.hocusProxusOptions.proxyPort
          });
        }
        resolve(newConfig);
      } catch (error) {
        reject(error);
      }
    });
  }

  getInternalIp() {
    return this.networkSettings.getIpAddress();
  }

  listConfigs() {
    return this.rule.getRulesConfig();
  }

  printQRCode(data) {
    return new Promise((resolve, reject) => {
      if(!data) {
        return reject('Please provide a string for the QR Code');
      }

      try {
        qrcode.generate(data, { small: true }, resolve);
      } catch(error) {
        reject(error);
      }
    });
  }
}

module.exports = HocusProxus;
