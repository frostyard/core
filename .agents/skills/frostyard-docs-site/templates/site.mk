# The documentation site (site/), built with pinned ProperDocs and MaterialX.
# Paste this fragment into the repository's Makefile, and add `site` and
# `site-serve` to its `.PHONY` line. `make ci` does not build the site, so a
# change that does not touch site/ needs no Python toolchain.
SITE_VENV := build/site-venv

$(SITE_VENV)/bin/properdocs: site/requirements.txt
	python3 -m venv $(SITE_VENV)
	$(SITE_VENV)/bin/pip install -q --require-hashes -r site/requirements.txt
	touch $@

site: $(SITE_VENV)/bin/properdocs
	$(SITE_VENV)/bin/properdocs build --strict -f site/properdocs.yml

site-serve: $(SITE_VENV)/bin/properdocs
	$(SITE_VENV)/bin/properdocs serve -f site/properdocs.yml
