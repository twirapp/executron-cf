FROM docker.io/cloudflare/sandbox:0.6.7

RUN bun add -g lodash

# Required during local development to access exposed ports
EXPOSE 8080
