FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

RUN mkdir -p /home/node/.claude /home/node/.config/gh && chown -R node:node /home/node/.claude /home/node/.config

RUN corepack enable
