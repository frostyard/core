# Build from source

Replace this page with the steps a contributor follows: the toolchain, the
build, and the checks the repository runs on a pull request.

## Build and check

The repository builds the documentation site with `make site`, and holds it on
`make site-serve`:

```sh
make site        # strict build into site/dist
make site-serve  # preview at http://127.0.0.1:8000/PROJECT/
```

The site needs the Python lock in `site/requirements.txt` and writes its
virtual environment to `build/site-venv`. `make ci` does not build the site.

## Write for users

Pages live in `site/content/`. A page explains what a user does, not how the
code works: the maintainer contracts stay in `docs/`. Read the
[example guide](../guides/example.md) for the shape of a page.
