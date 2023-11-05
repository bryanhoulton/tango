# Tango

Tango is an open source, batteries-included backend framework closely modeled after Django Rest Framework (DRF), but written in TypeScript.

## Getting Started

You can check out the example project in `src/example/` to see how Tango works. I haven't listed this package on NPM yet, so you'll have to clone the repo and run `yarn install` to get started.

After installing, run `yarn example` to run the example app.

## Features

- Direct access to TypeORM
- Automattic CRUD endpoints using ViewSets
- Easy-to-write views
- Robust URL routing
- Out-of-the-box authentication and permissions
- Easily accessible middleware

## Design Choices

- Tango is explicitly a backend framework. While Django has a template engine, Tango does not. Tango is meant to be used in conjunction with a frontend framework like React or Vue.
- IMO the best way to build a backend is to use a strongly typed language. While Python is a great language, it lacks this.

## Usage

Tango is nowhere near production ready. Use at your own risk. There is no guarantee that this package will be consistently maintained.

## Roadmap

- [x] Basic CRUD endpoints
- [x] Basic URL routing
- [x] Basic middleware
- [ ] Basic authentication
- [ ] Basic permissions
- [ ] Filtering viewsets
- [ ] Pagination
- [ ] Throttling
- [ ] tRPC or OpenAPI
