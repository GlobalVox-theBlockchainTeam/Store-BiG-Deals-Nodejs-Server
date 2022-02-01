FROM node:14

WORKDIR /usr/src/app
COPY . .

RUN npm cache clear --force && npm install
EXPOSE 3000
ENTRYPOINT ["node", "index.js"]