import { Model } from "./";

type JSONValue = string | number | boolean | JSONObject | JSONArray;

export interface JSONObject {
  [x: string]: JSONValue;
}

interface JSONArray extends Array<JSONValue> {}

export class ModelSerializer<T extends Model> {
  serialize(model: T): JSONObject {
    return {
      _modelName: model._modelName,
    };
  }
}
