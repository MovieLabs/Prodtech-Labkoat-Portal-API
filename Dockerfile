FROM node:24-bookworm

WORKDIR /app
COPY . .
RUN npm install --quiet --omit=dev
RUN npm i --prefix ./mlHelpers --quiet --omit=dev

EXPOSE 8080

# ensure host is set
CMD [ "node", "app.js", "--host=\"0.0.0.0\"" ]
