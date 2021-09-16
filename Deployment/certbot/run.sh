#!/bin/sh
certbot certonly -n -a webroot --webroot-path=/usr/share/nginx/html --email s@sui.li --server https://acme-v02.api.letsencrypt.org/directory --manual-public -ip-logging-ok --agree-tos -d cdn.weblin.io
kubectl delete secret tls-cdn-weblin-io --namespace=n3q-prod
kubectl create secret tls tls-cdn-weblin-io --cert /etc/letsencrypt/live/cdn.weblin.io/fullchain.pem --key /etc/letsencrypt/live/cdn.weblin.io/privkey.pem --namespace=n3q-prod
