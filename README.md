# Tango

Tango is an open source, batteries-included backend framework closely modeled after Django Rest Framework (DRF), but written in TypeScript.

## Getting Started

You can check out the example project [here](https://github.com/bryanhoulton/tango-example) to see how it works. But here's a quick sneak peak.

Building basic CRUD functionality for a TypeORM entity `Blog` can be done like this:
```ts
export class BlogViewset extends BaseViewSet<typeof Blog> {
  entity = Blog;
  serializer = BlogSerializer;
  permissions: Permission[] = [new IsAuthenticated()];
}
```

and run the server like this:
```ts
const server = new TangoServer({
  datasource: AppDataSource, // TypeORM datasource to your database
  routes: {
    blog: TangoRouter.convertViewSet(new BlogViewset()),
  },
});

server.listen({
  port: 8000,
});
```

This generates the following routes:
- `/blog` GET: List blogs
- `/blog` POST: Creates a new blog
- `/blog/:id` GET: Read a specific blog
- `/blog/:id` PUT: Update a specific blog
- `/blog/:id` PATCH: Partially update a specific blog
- `/blog/:id` DELETE: Delete a specific blog

If you want to handle requests without viewsets, that's easy too:
```ts
const server = new TangoServer({
  ...
  routes: {
    blog: TangoRouter.convertViewSet(new BlogViewset()),
    health_check: {
      GET: async (req) => ({
        body: {
          message: "pong!"
        },
        status: 200
      })
    }
  },
});
```

## Features

- Direct access to TypeORM entities
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
- [x] Extremely basic serializers 
- [x] Basic URL routing
- [x] Basic middleware
- [ ] Basic authentication
- [ ] Batteries included entities (Users, Teams, etc)
- [x] Basic permissions
- [ ] Filtering viewsets
- [ ] Pagination
- [ ] Throttling
- [ ] tRPC or OpenAPI
