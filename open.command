#!/bin/bash

cd "$(dirname "$0")"
pwd

# Kill only the process using port 3000
PID=$(lsof -ti tcp:3000)
if [ -n "$PID" ]; then
  kill -9 $PID
fi

# Start server
node server.js 


sleep 1


# Optionally open in browser
open http://localhost:3000



