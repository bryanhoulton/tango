import type {
  Fields,
  InferInsert,
  InferSelect,
  Prettify
} from '@tango-ts/core-types'
import { Field } from '@tango-ts/orm'

export type ValidationErrors = Record<string, string[]>

type FieldName<F extends Fields> = keyof F & string
type Selected<F extends Fields, Names extends readonly FieldName<F>[]> = Names[number]
type ReadOnly<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Selected<F, Names>[]
> = ReadOnlyNames[number]
type Writable<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Selected<F, Names>[]
> = Exclude<Selected<F, Names>, ReadOnly<F, Names, ReadOnlyNames>>

type InputFields<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Selected<F, Names>[]
> = Pick<F, Writable<F, Names, ReadOnlyNames>>

export type SerializerInput<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Selected<F, Names>[]
> = InferInsert<InputFields<F, Names, ReadOnlyNames>>

export type SerializerOutput<
  F extends Fields,
  Names extends readonly FieldName<F>[]
> = Prettify<Pick<InferSelect<F>, Selected<F, Names>>>

export interface SerializerModel<F extends Fields> {
  readonly fields: F
  readonly objects: {
    create(data: InferInsert<F>): Promise<InferSelect<F>>
  }
}

export interface ModelSerializerOptions<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Names[number][] = readonly []
> {
  readonly fields: Names
  readonly readOnlyFields?: ReadOnlyNames
}

export interface ModelSerializerDefinition<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Names[number][]
> {
  readonly model: SerializerModel<F>
  readonly fields: Names
  readonly readOnlyFields: ReadOnlyNames
  serialize(row: InferSelect<F>): SerializerOutput<F, Names>
  forInput(
    input: SerializerInput<F, Names, ReadOnlyNames>
  ): ModelSerializerInstance<F, Names, ReadOnlyNames>
  forUnknownInput(input: unknown): ModelSerializerInstance<F, Names, ReadOnlyNames>
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function expectedMessage(field: Field): string {
  switch (field.spec.columnType) {
    case 'int':
    case 'float':
      return field.spec.nullable ? 'Expected number or null.' : 'Expected number.'
    case 'varchar':
    case 'text':
      return field.spec.nullable ? 'Expected string or null.' : 'Expected string.'
    case 'boolean':
      return field.spec.nullable ? 'Expected boolean or null.' : 'Expected boolean.'
    case 'datetime':
    case 'date':
      return field.spec.nullable ? 'Expected Date or null.' : 'Expected Date.'
  }
}

function valueMatches(field: Field, value: unknown): boolean {
  if (value === null) {
    return field.spec.nullable
  }
  switch (field.spec.columnType) {
    case 'int':
    case 'float':
      return typeof value === 'number'
    case 'varchar':
    case 'text':
      return typeof value === 'string'
    case 'boolean':
      return typeof value === 'boolean'
    case 'datetime':
    case 'date':
      return value instanceof Date
  }
}

function isOptionalInput(field: Field): boolean {
  return field.spec.nullable || field.spec.hasDefault
}

export class ModelSerializerInstance<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Selected<F, Names>[]
> {
  private didValidate = false
  private currentErrors: ValidationErrors = {}
  private currentValidatedData:
    | SerializerInput<F, Names, ReadOnlyNames>
    | undefined

  constructor(
    private readonly model: SerializerModel<F>,
    private readonly names: Names,
    private readonly readOnlyNames: ReadOnlyNames,
    private readonly input: unknown
  ) {}

  get errors(): ValidationErrors {
    if (!this.didValidate) {
      this.isValid()
    }
    return this.currentErrors
  }

  get validatedData(): SerializerInput<F, Names, ReadOnlyNames> | undefined {
    if (!this.didValidate) {
      this.isValid()
    }
    return this.currentValidatedData
  }

  isValid(): boolean {
    const errors: ValidationErrors = {}
    const validated: Record<string, unknown> = {}
    const allowed = new Set<string>(this.names)
    const writable = this.names.filter(
      (name) => !this.readOnlyNames.includes(name)
    )

    if (!isRecord(this.input)) {
      this.currentErrors = { nonFieldErrors: ['Expected object.'] }
      this.currentValidatedData = undefined
      this.didValidate = true
      return false
    }

    for (const key of Object.keys(this.input)) {
      if (!allowed.has(key)) {
        errors[key] = ['Unknown field.']
      } else if (this.readOnlyNames.includes(key)) {
        errors[key] = ['This field is read-only.']
      }
    }

    for (const name of writable) {
      const field = this.model.fields[name] as Field
      if (!Object.hasOwn(this.input, name)) {
        if (!isOptionalInput(field)) {
          errors[name] = ['This field is required.']
        }
        continue
      }
      const value = this.input[name]
      if (!valueMatches(field, value)) {
        errors[name] = [expectedMessage(field)]
        continue
      }
      validated[name] = value
    }

    this.currentErrors = errors
    this.currentValidatedData =
      Object.keys(errors).length === 0
        ? (validated as SerializerInput<F, Names, ReadOnlyNames>)
        : undefined
    this.didValidate = true
    return Object.keys(errors).length === 0
  }

  async save(): Promise<InferSelect<F>> {
    if (!this.isValid() || this.currentValidatedData === undefined) {
      throw new Error('Cannot save serializer with invalid data.')
    }
    return this.model.objects.create(
      this.currentValidatedData as unknown as InferInsert<F>
    )
  }
}

export function modelSerializer<
  F extends Fields,
  Names extends readonly FieldName<F>[],
  ReadOnlyNames extends readonly Names[number][] = readonly []
>(
  model: SerializerModel<F>,
  options: ModelSerializerOptions<F, Names, ReadOnlyNames>
): ModelSerializerDefinition<F, Names, ReadOnlyNames> {
  const readOnlyFields = (options.readOnlyFields ?? []) as ReadOnlyNames

  return {
    model,
    fields: options.fields,
    readOnlyFields,

    serialize(row: InferSelect<F>): SerializerOutput<F, Names> {
      const output: Record<string, unknown> = {}
      for (const name of options.fields) {
        output[name] = row[name]
      }
      return output as SerializerOutput<F, Names>
    },

    forInput(
      input: SerializerInput<F, Names, ReadOnlyNames>
    ): ModelSerializerInstance<F, Names, ReadOnlyNames> {
      return new ModelSerializerInstance(
        model,
        options.fields,
        readOnlyFields,
        input
      )
    },

    forUnknownInput(
      input: unknown
    ): ModelSerializerInstance<F, Names, ReadOnlyNames> {
      return new ModelSerializerInstance(
        model,
        options.fields,
        readOnlyFields,
        input
      )
    }
  }
}
