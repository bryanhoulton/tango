import { TangoResolver } from '../view';
import { BaseViewSet } from '../viewset';
import {
  Blog,
  BlogSerializer,
} from './entity';

export class BlogViewset extends BaseViewSet<typeof Blog> {
  entity = Blog;

  extractLogicalSection1(data: any) {
    // Implementation details for logical section 1
  }

  extractLogicalSection2(data: any) {
    // Implementation details for logical section 2
  }
  serializer = BlogSerializer;
}

export const healthCheck: TangoResolver = async (req) => ({
  body: {
    message: "hello world",
  },
  status: 200,
});
