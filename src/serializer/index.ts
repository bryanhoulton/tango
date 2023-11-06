import {
  instanceToPlain,
  plainToInstance,
} from 'class-transformer';
import {
  validate,
  ValidationError,
} from 'class-validator';
import { BaseEntity } from 'typeorm';

import { ValueOrError } from '../types';

export class Serializer<T extends typeof BaseEntity> {
  entity: T;
  fields: string[] = [];

  constructor() {}

  async serialize(data: T): Promise<any> {
    return instanceToPlain(data);
  }

  async deserialize(data: any): Promise<ValueOrError<T, ValidationError[]>> {
    const instance = plainToInstance(this.entity, data, {
      excludeExtraneousValues: true,
    }) as unknown as T;

    const errors = await validate(instance, {
      validationError: { target: false },
    });

    if (errors.length > 0) {
      return {
        error: errors,
      };
    } else {
      return {
        value: instance,
      };
    }
  }
}
