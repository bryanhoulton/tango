import { Model } from "./";

export class ModelManager<T extends Model> {
  findById(id: number): T | null {
    if (id === 1) return null;

    return {
      _modelName: "TangoModel",
    } as T;
  }

  filter(arg: any): T[] {
    return [];
  }

  all(): T[] {
    return [];
  }
}
