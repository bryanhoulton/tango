import { TokenAuthentication } from "../authentication";
import { Model } from "../model";
import { AllowAny } from "../permissions";
import { TangoRouter } from "../router";
import { TangoServer } from "../server";
import { ModelViewSet } from "../viewset";

// example/models.ts -- I could be convinced to use an existing ORM for this.
class Blog extends Model {}

// example/views.ts
class BlogMVS extends ModelViewSet {
  model = Blog;
}

// example/index.ts
const server = new TangoServer({
  global: {
    permissions: [new AllowAny()],
    authentication: [new TokenAuthentication()],
  },
  routes: {
    blog: TangoRouter.convertViewset(new BlogMVS()),
  },
});

server.listen({
  port: 8080,
});
