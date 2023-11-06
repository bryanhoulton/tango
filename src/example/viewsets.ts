import {
  IsAuthenticated,
  Permission,
} from '../permissions';
import { TangoResolver } from '../view';
import { BaseViewSet } from '../viewset';
import {
  Blog,
  BlogSerializer,
} from './entity';

export class BlogViewset extends BaseViewSet<typeof Blog> {
  entity = Blog;
  serializer = BlogSerializer;
  permissions: Permission[] = [new IsAuthenticated()];
}

export const healthCheck: TangoResolver = async (req) => {
  return {
    status: 200,
    body: {
      message: "ok",
    },
  };
};
