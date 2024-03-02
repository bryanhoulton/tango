import { IsAuthenticated, Permission } from "../permissions";
import { TangoResolver } from "../view";
import { BaseViewSet } from "../viewset";
import { Blog, BlogSerializer } from "./entity";

/**
 * Represents a viewset for the Blog entity.
 * Provides CRUD operations for the Blog entity.
 */
export class BlogViewset extends BaseViewSet<typeof Blog> {
  entity = Blog;
  serializer = BlogSerializer;
  permissions: Permission[] = [new IsAuthenticated()];
}

export const healthCheck: TangoResolver = async (req) => ({
  body: {
    message: "hello world",
  },
  status: 200,
});
