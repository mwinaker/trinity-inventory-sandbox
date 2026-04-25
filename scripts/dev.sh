#!/usr/bin/env zsh

SANDBOX_DIR="/Users/mwinaker/Documents/trinity-shopify-billet-sandbox"

export PATH="$SANDBOX_DIR/bin:$SANDBOX_DIR/.tools/node/bin:$PATH"
export SHOPIFY_CLI_NO_ANALYTICS=1

npm run dev -- --host 127.0.0.1

