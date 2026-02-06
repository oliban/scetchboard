#!/bin/sh
set -e

# Restore database from S3 if it doesn't exist locally
if [ ! -f /data/sketchnotes.db ]; then
  echo "No local database found. Attempting restore from S3..."
  litestream restore -if-replica-exists -config /etc/litestream.yml /data/sketchnotes.db || echo "No replica found, starting fresh."
fi

# Run the app with Litestream replication
if [ -n "$LITESTREAM_BUCKET" ]; then
  echo "Starting with Litestream replication..."
  exec litestream replicate -config /etc/litestream.yml -exec "node server.js"
else
  echo "No LITESTREAM_BUCKET set, starting without replication..."
  exec node server.js
fi
