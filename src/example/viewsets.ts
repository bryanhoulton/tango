import { TangoResolver } from '../view';
import { BaseViewSet } from '../viewset';
import {
  Blog,
  BlogSerializer,
} from './entity';

export class BlogViewset extends BaseViewSet<typeof Blog> {
  entity = Blog;
  serializer = BlogSerializer;
}

export const healthCheck: TangoResolver = async (req) => ({
  body: {
    message: "hello world",
  },
  status: 200,
});
