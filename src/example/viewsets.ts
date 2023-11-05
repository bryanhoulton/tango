import { AllowAny, Permission } from "../permissions";
import { BaseViewSet } from "../viewset";
import { Blog } from "./entity";

export class BlogViewset extends BaseViewSet<typeof Blog> {
  entity = Blog;
  permissions: Permission[] = [new AllowAny()];
}
