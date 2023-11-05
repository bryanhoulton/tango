# Tango

Tango is an open source, batteries-included backend framework closely modeled after Django Rest Framework (DRF), but written in TypeScript.

## Getting Started

You can check out the example project [here](https://github.com/bryanhoulton/tango-example) to see how it works.

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
