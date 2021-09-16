# === build js
FROM ubuntu AS build

WORKDIR /app
COPY ./ChromeExt ./

RUN apt-get update
RUN apt-get install -y curl python build-essential
RUN curl -fsSL https://deb.nodesource.com/setup_15.x | bash -
RUN apt-get install -y nodejs=15.14.0-deb-1nodesource1
RUN npm install
RUN npm run release-embedded

# === setup webserver
FROM nginx:1.19.0-alpine

WORKDIR /app
RUN sed -i "s|#gzip|gzip_types text/css application/javascript;\ngzip|g" /etc/nginx/nginx.conf
COPY ./Deployment/html /usr/share/nginx/html
COPY ./Deployment/docker/embedded/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html/v1