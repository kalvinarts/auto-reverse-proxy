#!/usr/bin/env node

const { constants } = require('crypto');

const debug = require('debug')('auto-reverse-proxy');
const Docker = require('dockerode');
const Redbird = require('redbird');

const { ProxyManager } = require('../index');

const {
  ARP_CERTS_PATH,
  ARP_SOCKET_PATH,
  ARP_NETWORK_NAME,
  ARP_LETSENCRYPT_PORT,
  ARP_LETSENCRYPT_DEV,
} = process.env;

const argv = require('yargs')
  .scriptName('auto-reverse-proxy')
  .option('certs-path', {
    alias: 'c',
    demandOption: true,
    default: ARP_CERTS_PATH || '/tmp/certs',
    describe: '(ARP_CERTS_PATH) Path to store the auto-generated certificates',
    type: 'string',
  })
  .option('socket-path', {
    alias: 's',
    demandOption: true,
    default: ARP_SOCKET_PATH || '/var/run/docker.sock',
    describe: '(ARP_SOCKET_PATH) Path of the docker unix socket',
    type: 'string',
  })
  .option('network-name', {
    alias: 'n',
    demandOption: true,
    default: ARP_NETWORK_NAME || 'bridge',
    describe: '(ARP_NETWORK_NAME) Network to monitor for containers to register',
    type: 'string',
  })
  .option('letsencrypt-port', {
    alias: 'p',
    demandOption: true,
    default: ARP_LETSENCRYPT_PORT || 9999,
    describe: '(ARP_LETSENCRYPT_PORT) Port for recieving the certificates from letsencrypt',
  })
  .option('letsencrypt-devel', {
    alias: 'd',
    demandOption: true,
    default: ARP_LETSENCRYPT_DEV === 'true' ? true : false,
    describe: '(ARP_LETSENCRYPT_DEV) Development mode for letsencrypt',
    type: 'boolean',
  })
  .argv;

async function main () {
  const options = Object.entries(argv)
    .map(([k, v]) => /-/.test(k) ? [k, v] : null)
    .filter(opt => opt)
    .reduce((a, [k, v]) => ({ ...a, [k]: v }), {});

  debug('Start options:\n', options);


  debug('Connecting to Docker ...');
  const docker = new Docker({
    socketPath: argv.socketPath,
  });

  debug('Starting redbird proxy ...');
  const redbird = Redbird({
    port: 80,
    xfwd: true, // http port is needed for LetsEncrypt challenge during request / renewal. Also enables automatic http->https redirection for registered https routes.
    letsencrypt: {
      path: argv.certsPath,
      port: argv.letsencryptPort, // redbird gets your certificates throug this port
      production: !argv.letsencryptPortDev,
    },
    ssl: {
      http2: true,
      port: 443, // SSL port used to serve registered https routes with LetsEncrypt certificate.
      secureOptions: constants.SSL_OP_NO_TLSv1,
    },
    bunyan: false, // Disable bunyan
  });

  const proxyManager = new ProxyManager({
    redbird,
    docker,
    networkName: argv.networkName,
  });

  await proxyManager.start();
}

main().catch(err => debug(err.message, err.stack) && process.exit(1));
