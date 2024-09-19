FROM node:18
WORKDIR /usr/src/app
COPY package.json ./
RUN npm install
COPY . .
COPY .env ./
CMD ["node", "main.mjs"]
