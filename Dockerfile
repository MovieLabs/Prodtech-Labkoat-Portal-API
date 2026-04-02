FROM node:24-bookworm

WORKDIR /app
COPY . .
RUN npm install --quiet

EXPOSE 8080

# ensure host is set
CMD [ "node", "app.js", "--host=\"0.0.0.0\"" ]
