SHELL := /usr/bin/env bash

.PHONY: verify check ci

verify:
	npm run verify

check:
	npm run check

ci:
	npm run check
