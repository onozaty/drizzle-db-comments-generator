FROM node:24-bookworm

RUN apt-get update && apt-get install -y --no-install-recommends \
    sudo \
    git \
    && rm -rf /var/lib/apt/lists/*

RUN echo "node ALL=(root) NOPASSWD:ALL" > /etc/sudoers.d/node \
    && chmod 0440 /etc/sudoers.d/node

RUN mkdir -p /home/node/.claude /home/node/.config/gh && chown -R node:node /home/node/.claude /home/node/.config

# Skip the confirmation prompt when corepack downloads the pnpm version pinned in package.json
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0

RUN corepack enable
