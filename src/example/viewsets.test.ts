import { IsAuthenticated, Permission } from "../permissions";
import { TangoResolver } from "../view";
import { BaseViewSet } from "../viewset";
import { Blog, BlogSerializer } from "./entity";

describe("BlogViewset", () => {
  let blogViewset: BlogViewset;

  beforeEach(() => {
    blogViewset = new BlogViewset();
  });

  it("should set the entity property correctly", () => {
    expect(blogViewset.entity).toBe(Blog);
  });

  it("should set the serializer property correctly", () => {
    expect(blogViewset.serializer).toBe(BlogSerializer);
  });

  it("should contain the expected permissions", () => {
    expect(blogViewset.permissions).toEqual([new IsAuthenticated()]);
  });

  // Add more test cases for different scenarios

});

describe("healthCheck", () => {
  it("should return the expected response body and status code", async () => {
    const req = {}; // Provide any necessary request data

    const result = await healthCheck(req);

    expect(result.body).toEqual({ message: "hello world" });
    expect(result.status).toBe(200);
  });

  // Add more test cases for different scenarios

});
