const Docker =  require('dockerode');

const debug = require('debug')('proxy-manager');
const DockerEvents = require('./DockerEvents');

class ProxyManager {
  constructor(opts = {
    redbird: null,
    docker: new Docker(),
    networkName: 'bridge',
    debugMode: false,
  }) {
    Object.assign(this, opts);
    
    this.events = new DockerEvents(this.docker);
    this.configs = new Map();
  }

  async getContainerData(id) {
    const container = await this.docker.getContainer(id);
    return await container.inspect();
  }

  getEnv(data) {
    return data.Config.Env
      .map(v => {
        const parts = v.split('=');
        return {
          [parts[0]]: parts[1],
        };
      })
      .reduce((a, e) => ({ ...a, ...e }), {});
  }

  async containerHandler(e) {
    
    const { Action, Actor } = e;

    debug(Action, Actor.Attributes);

    if (Actor.Attributes.name === this.networkName) {

      const container = await this.docker
        .getContainer(Actor.Attributes.container);
  
      const containerInfo = await container.inspect();
      
      const config = {
        id: containerInfo.Id,
        network: containerInfo.NetworkSettings,
        env: this.getEnv(containerInfo),
      };

      if (config.env.VIRTUAL_HOST) {
        if (Action === 'connect') {
          this.register(config);
        }

        if (Action === 'disconnect') {
          this.unregister(config.id);
        }
      }
    }

  }

  register(config) {
    if (this.configs.get(config.id)) return;

    this.configs.set(config.id, config);

    const proxyConfigs = config.env.VIRTUAL_HOST
      .split(',')
      .map(domain => ({
        domain,
        target: `http://${
          config.network.Networks[this.networkName].IPAddress
        }:${
          Object
            .keys(config.network.Ports)[0]
            .split('/')[0]
        }`,
      }));

    for (let letsencryptHost of config.env.LETSENCRYPT_HOST.split(',')) {
      const proxyConfig = proxyConfigs.find(c => c.domain === letsencryptHost);

      if (proxyConfig) {
        proxyConfig.options = {
          ssl: {
            letsencrypt: {
              email: config.env.LETSENCRYPT_EMAIL,
              production: true,
            },
          },
        };
      }
    }

    for (let { domain, target, options } of proxyConfigs) {
      debug('Registering', domain, target, options);
      this.redbird.register(domain, target, options);
    }
  }

  unregister(id) {
    const config = this.configs.get(id);
    if (!config) return;

    this.configs.delete(id);

    const proxyConfigs = config.env.VIRTUAL_HOST
      .split(',')
      .map(domain => ({
        domain,
        target: `http://${
          config.network.Networks[this.networkName].IPAddress
        }:${
          Object
            .keys(config.network.Ports)[0]
            .split('/')[0]
        }`,
      }));

    for (let { domain, target } of proxyConfigs) {
      debug('Unregistering', domain, target);
      this.redbird.unregister(domain, target);
    }
  }

  async start() {
    debug('Start');
    await this.events.start();
    this.events
      .on('network', e => this.containerHandler(e));
  }

  async stop() {
    debug('Stop');
    await this.events.stop();
    this.events
      .removeListener('network', e => this.containerHandler(e));
  }
}

module.exports = ProxyManager;
