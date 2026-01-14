.PHONY: default build clean docs git-hook pretty lint test run

default: build

build: output

clean:
	rm --force --recursive node_modules output tsconfig.tsbuildinfo

docs:
	@echo "No documentation included by default."

git-hook:
	echo "make pretty" > .git/hooks/pre-commit

pretty: node_modules
	npm exec -- biome check --write --no-errors-on-unmatched
	npm pkg fix

lint: node_modules
	npm exec -- biome check .
	npm exec -- tsc --noEmit

test:
	@echo "This project has no tests."

run: node_modules
	npm exec -- vite serve


node_modules: node_modules/.package-lock.json
node_modules/.package-lock.json: package-lock.json
	npm ci
package-lock.json: package.json
	npm install

output: node_modules
	npm exec -- vite build

preview: clean
	npm exec -- vite preview
