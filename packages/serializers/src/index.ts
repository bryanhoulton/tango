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
  forUnknownInput(
    input: unknown,
    options?: SerializerInstanceOptions
  ): ModelSerializerInstance<F, Names, ReadOnlyNames>
}

export interface SerializerInstanceOptions {
  readonly partial?: boolean
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function expectedMessage(field: Field): string {
  const orNull = field.spec.nullable ? ' or null' : ''
  switch (field.spec.columnType) {
    case 'int':
    case 'float':
      return `Expected number${orNull}.`
    case 'varchar':
    case 'text':
      return `Expected string${orNull}.`
    case 'boolean':
      return `Expected boolean${orNull}.`
    case 'datetime':
      return `Expected ISO 8601 datetime${orNull}.`
    case 'date':
      return `Expected ISO 8601 date (YYYY-MM-DD)${orNull}.`
  }
}

// JSON has no Date type, so datetime/date fields accept ISO 8601 strings over
// HTTP and normalize them to Date for the ORM. `new Date(...)` alone is not a
// validator (it "parses" garbage like "5"), hence the explicit patterns.
const DATETIME_PATTERN =
  /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(:\d{2}(\.\d{1,6})?)?(Z|[+-]\d{2}:?\d{2})?$/
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/

type NormalizedValue = { readonly ok: true; readonly value: unknown } | { readonly ok: false }

const INVALID: NormalizedValue = { ok: false }

function normalizeDatetime(value: unknown): NormalizedValue {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true, value }
  }
  if (typeof value === 'string' && DATETIME_PATTERN.test(value)) {
    const parsed = new Date(value)
    if (!Number.isNaN(parsed.getTime())) {
      return { ok: true, value: parsed }
    }
  }
  return INVALID
}

function normalizeDate(value: unknown): NormalizedValue {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return { ok: true, value }
  }
  if (typeof value !== 'string') {
    return INVALID
  }
  const match = DATE_PATTERN.exec(value)
  if (match === null) {
    return INVALID
  }
  const [, year, month, day] = match
  // Local midnight survives mysql2's local-time formatting, so the calendar
  // date the client sent is the calendar date stored in the DATE column.
  const parsed = new Date(Number(year), Number(month) - 1, Number(day))
  const isRealCalendarDate =
    parsed.getFullYear() === Number(year) &&
    parsed.getMonth() === Number(month) - 1 &&
    parsed.getDate() === Number(day)
  return isRealCalendarDate ? { ok: true, value: parsed } : INVALID
}

/** Validate a value against a field and normalize it for persistence. */
function normalizeValue(field: Field, value: unknown): NormalizedValue {
  if (value === null) {
    return field.spec.nullable ? { ok: true, value: null } : INVALID
  }
  switch (field.spec.columnType) {
    case 'int':
    case 'float':
      return typeof value === 'number' ? { ok: true, value } : INVALID
    case 'varchar':
    case 'text':
      return typeof value === 'string' ? { ok: true, value } : INVALID
    case 'boolean':
      return typeof value === 'boolean' ? { ok: true, value } : INVALID
    case 'datetime':
      return normalizeDatetime(value)
    case 'date':
      return normalizeDate(value)
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
    private readonly input: unknown,
    private readonly options: SerializerInstanceOptions = {}
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
        if (this.options.partial !== true && !isOptionalInput(field)) {
          errors[name] = ['This field is required.']
        }
        continue
      }
      const normalized = normalizeValue(field, this.input[name])
      if (!normalized.ok) {
        errors[name] = [expectedMessage(field)]
        continue
      }
      validated[name] = normalized.value
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
      input: unknown,
      instanceOptions: SerializerInstanceOptions = {}
    ): ModelSerializerInstance<F, Names, ReadOnlyNames> {
      return new ModelSerializerInstance(
        model,
        options.fields,
        readOnlyFields,
        input,
        instanceOptions
      )
    }
  }
}
