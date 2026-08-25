#!/bin/sh
# Optional session-start hook. Default off — enable later with `mental hooks on`.
# Caps output so agent context stays small.
mental status --json 2>/dev/null | head -c 4096
