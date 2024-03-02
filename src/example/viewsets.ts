import { IsAuthenticated, Permission } from "../permissions";
import { TangoResolver } from "../view";
import { BaseViewSet } from "../viewset";
import { Blog, BlogSerializer } from "./entity";

export class BlogViewsetTest extends BaseViewSet<typeof Blog> {
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
