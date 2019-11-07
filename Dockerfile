FROM node:lts-alpine

COPY ./* /home/node/

WORKDIR /home/node

RUN npm install --production

RUN mkdir /var/auto-reverse-proxy
RUN chown node:node /var/auto-reverse-proxy

USER node

# Create the default directory to store the certificates
RUN mkdir /tmp/certs

VOLUME /var/run/docker.sock
VOLUME /var/auto-reverse-proxy
VOLUME /tmp/certs

EXPOSE 80
EXPOSE 443
EXPOSE 9999

ENTRYPOINT [ "node", "index.js" ]