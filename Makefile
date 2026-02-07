.PHONY: test lint fmt build deploy

test:
	npm test

lint:
	npm run lint

fmt:
	npm run fmt:check

build:
	npm run build

deploy: test lint fmt build
	npx vercel --prod --yes
