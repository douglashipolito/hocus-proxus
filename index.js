const co = require('co');
const AnyProxy = require('anyproxy');
const fs = require('fs');
const internalIp = require('internal-ip');
const rootCACheck = require('./rootCACheck');
const lan = require('lan-settings');
const exitHook = require('async-exit-hook');
const config = require('./config.json');

co(function *() {
  const internalV4Ip = yield internalIp.v4();
  let proxyServer;

  function setProxyConfig(enable, done = function() {}) {
    const proxyPacFile = `http://${internalV4Ip}:${config.webinterfacePort}/proxy.pac`;
  
    lan.setSettings({
      autoConfig: enable,
      autoConfigUrl: proxyPacFile
    })
    .then(() => {
      if(enable) {
        console.log(`Proxy Auto Config enabled and set to ${proxyPacFile}`);
      } else {
        console.log(`Proxy Auto Config disabled`);
      }
      done()
    })
    .catch(error => {
      console.log('Proxy Lan Settings: ', error);
      done(error);
    });
  
    if(enable) {
      proxyServer.webServerInstance.app.get('/proxy.pac', (req, res) => {
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Content-type', 'text/plain');
        fs.readFile('proxy.pac', { encoding: 'utf8' }, (error, data) => {
          if(error) {
            console.log(error);
            return res.end('Error on requesting proxy pac');
          }
          
          data = data.replace(/#PROXY/g, `${internalV4Ip}:${config.proxyPort}`);
          data = data.replace(/#DOMAIN/g, config.domain);
          res.end(data);
        });
      });
    }
  }
  
  function startServer() {
    const options = {
      port: config.proxyPort,
      rule: require('./rule'),
      webInterface: {
        enable: true,
        webPort: config.webinterfacePort
      },
      forceProxyHttps: true
    };
  
    proxyServer = new AnyProxy.ProxyServer(options);
  
    proxyServer.on('ready', () => { /* */ });
    proxyServer.on('error', (e) => { /* */ });
    proxyServer.start();
    setProxyConfig(true);
  }
  
  const caStatus = yield AnyProxy.utils.certMgr.getCAStatus();
  if(caStatus.exist && caStatus.trusted) {
    startServer();
  } else {
    try {
      yield rootCACheck();
      startServer();
    } catch (e) {
      console.error(e);
    }
  }

  exitHook(callback => {
    console.log('disabling proxy auto config');
    setProxyConfig(false, () => {
      console.log('pausing server...');
      proxyServer.close();
      setTimeout(callback, 200);
    });
  });
});

process
  .on('unhandledRejection', (reason, p) => {
    console.error(reason, 'Unhandled Rejection at Promise', p);
  })
  .on('uncaughtException', err => {
    console.error(err, 'Uncaught Exception thrown');
    process.exit(1);
  });
