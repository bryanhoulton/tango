import { TokenAuthentication } from "../authentication";
import { Model } from "../model";
import { CharField } from "../model/fields/char";
import { ModelManager } from "../model/manager";
import { ModelSerializer } from "../model/serializer";
import { AllowAny } from "../permissions";
import { TangoRouter } from "../router";
import { TangoServer } from "../server";
import { ModelViewSet } from "../viewset";

// example/models.ts -- I could be convinced to use an existing ORM for this.
class Blog implements Model {
  _modelName = "Blog";
  id = new CharField();
}

class BlogViewSet extends ModelViewSet<Blog> {
  constructor() {
    super({
      modelManager: new ModelManager<Blog>(),
      serializer: new ModelSerializer<Blog>(),
    });
  }
}

// example/index.ts
const server = new TangoServer({
  global: {
    permissions: [new AllowAny()],
    authentication: [new TokenAuthentication()],
  },
  routes: {
    blog: TangoRouter.convertViewset(new BlogViewSet()),
  },
});

server.listen({
  port: 8080,
});
