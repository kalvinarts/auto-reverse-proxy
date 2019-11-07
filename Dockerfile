FROM node:lts-alpine

COPY ./* /home/node/

WORKDIR /home/node

RUN npm install --production

USER node

# Create the default directory to store the certificates
RUN mkdir /tmp/certs

VOLUME /var/run/docker.sock
VOLUME /tmp/certs

EXPOSE 80
EXPOSE 443
EXPOSE 9999

CMD [ "node", "bin/index.js"]
