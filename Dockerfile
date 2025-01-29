FROM node:18

WORKDIR /app
COPY . .
RUN npm install --quiet

EXPOSE 8080

# ensure host is set
CMD [ "node", "api.mjs", "--host=\"0.0.0.0\"" ]
