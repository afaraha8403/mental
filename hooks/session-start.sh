#!/bin/sh
# Legacy session-start hook (Mental 0.12.1 and older wrote this absolute path).
# `mental hooks on` now writes `mental hooks session-start <host>` instead; this
# forwards so old entries keep working. The host is read from the stdin payload.
exec mental hooks session-start 2>/dev/null
