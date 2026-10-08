#!/usr/bin/env bash
# Reproduces the measurement matrix (about 30 CLI calls). Run from this directory.
set -u
export SPIKE_EXTRA="--effort low" SPIKE_TAG=low
node cold-start.mjs 3 haiku naive,isolated
node generate.mjs lesson haiku 3
node generate.mjs lesson sonnet 3
SPIKE_EXTRA="" SPIKE_TAG=default node generate.mjs lesson sonnet 3
node generate.mjs quiz haiku 4 schema
node generate.mjs quiz sonnet 3 schema
node generate.mjs quiz haiku 3 noschema
node generate.mjs lesson sonnet 3 stream 3   # 3 parallel calls
node errors.mjs
