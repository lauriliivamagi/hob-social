/**
 * GENERATED CODE - DO NOT MODIFY
 */
import { type ValidationResult, BlobRef } from '@atproto/lexicon'
import { CID } from 'multiformats/cid'
import { validate as _validate } from '../../../../lexicons'
import {
  type $Typed,
  is$typed as _is$typed,
  type OmitKey,
} from '../../../../util'

const is$typed = _is$typed,
  validate = _validate
const id = 'social.hob.temp.recipe'

export interface Main {
  $type: 'social.hob.temp.recipe'
  meta: Meta
  ingredients: Ingredient[]
  equipment: Equipment[]
  operations: Operation[]
  subProducts: SubProduct[]
  /** Client-declared timestamp when the record was published. */
  createdAt: string
  [k: string]: unknown
}

const hashMain = 'main'

export function isMain<V>(v: V) {
  return is$typed(v, id, hashMain)
}

export function validateMain<V>(v: V) {
  return validate<Main & V>(v, id, hashMain, true)
}

export {
  type Main as Record,
  isMain as isRecord,
  validateMain as validateRecord,
}

export interface Meta {
  $type?: 'social.hob.temp.recipe#meta'
  title: string
  /** URL-safe identifier. Matches the record rkey. */
  slug: string
  /** ISO 639-1 two-letter language code. */
  language: string
  /** Optional URL of the original recipe. */
  source?: string
  /** Full original recipe text in markdown for side-by-side review. */
  originalText: string
  tags: string[]
  servings: number
  totalTime: TotalTime
  difficulty: 'easy' | 'medium' | 'hard' | (string & {})
  /** Derived from DAG decision count + active time. */
  energyTier?: 'zombie' | 'moderate' | 'project' | (string & {})
  notes?: string
}

const hashMeta = 'meta'

export function isMeta<V>(v: V) {
  return is$typed(v, id, hashMeta)
}

export function validateMeta<V>(v: V) {
  return validate<Meta & V>(v, id, hashMeta)
}

export interface TotalTime {
  $type?: 'social.hob.temp.recipe#totalTime'
  relaxed: TimeRange
  optimized: TimeRange
}

const hashTotalTime = 'totalTime'

export function isTotalTime<V>(v: V) {
  return is$typed(v, id, hashTotalTime)
}

export function validateTotalTime<V>(v: V) {
  return validate<TotalTime & V>(v, id, hashTotalTime)
}

/** Duration in integer seconds. `max` is optional (exact duration when omitted). */
export interface TimeRange {
  $type?: 'social.hob.temp.recipe#timeRange'
  min: number
  max?: number
}

const hashTimeRange = 'timeRange'

export function isTimeRange<V>(v: V) {
  return is$typed(v, id, hashTimeRange)
}

export function validateTimeRange<V>(v: V) {
  return validate<TimeRange & V>(v, id, hashTimeRange)
}

/** Fixed-point decimal. Real value = value / 10^scale. Scale 0 means plain integer. */
export interface Decimal {
  $type?: 'social.hob.temp.recipe#decimal'
  value: number
  scale: number
}

const hashDecimal = 'decimal'

export function isDecimal<V>(v: V) {
  return is$typed(v, id, hashDecimal)
}

export function validateDecimal<V>(v: V) {
  return validate<Decimal & V>(v, id, hashDecimal)
}

/** Amount with unit, optionally a range. */
export interface Quantity {
  $type?: 'social.hob.temp.recipe#quantity'
  min: Decimal
  max?: Decimal
  unit: string
}

const hashQuantity = 'quantity'

export function isQuantity<V>(v: V) {
  return is$typed(v, id, hashQuantity)
}

export function validateQuantity<V>(v: V) {
  return validate<Quantity & V>(v, id, hashQuantity)
}

/** Equipment capacity. Positive value with unit (e.g., 5 L, 30 cm). */
export interface Capacity {
  $type?: 'social.hob.temp.recipe#capacity'
  min: Decimal
  unit: string
}

const hashCapacity = 'capacity'

export function isCapacity<V>(v: V) {
  return is$typed(v, id, hashCapacity)
}

export function validateCapacity<V>(v: V) {
  return validate<Capacity & V>(v, id, hashCapacity)
}

export interface Temperature {
  $type?: 'social.hob.temp.recipe#temperature'
  min: Decimal
  max?: Decimal
  unit: 'C' | 'F' | (string & {})
}

const hashTemperature = 'temperature'

export function isTemperature<V>(v: V) {
  return is$typed(v, id, hashTemperature)
}

export function validateTemperature<V>(v: V) {
  return validate<Temperature & V>(v, id, hashTemperature)
}

export interface IngredientBase {
  $type?: 'social.hob.temp.recipe#ingredientBase'
  id: string
  name: string
  quantity?: Quantity
  group: string
}

const hashIngredientBase = 'ingredientBase'

export function isIngredientBase<V>(v: V) {
  return is$typed(v, id, hashIngredientBase)
}

export function validateIngredientBase<V>(v: V) {
  return validate<IngredientBase & V>(v, id, hashIngredientBase)
}

export interface Ingredient {
  $type?: 'social.hob.temp.recipe#ingredient'
  id: string
  name: string
  quantity?: Quantity
  group: string
  alternatives?: IngredientBase[]
}

const hashIngredient = 'ingredient'

export function isIngredient<V>(v: V) {
  return is$typed(v, id, hashIngredient)
}

export function validateIngredient<V>(v: V) {
  return validate<Ingredient & V>(v, id, hashIngredient)
}

export interface Equipment {
  $type?: 'social.hob.temp.recipe#equipment'
  id: string
  name: string
  count: number
  capacity?: Capacity
}

const hashEquipment = 'equipment'

export function isEquipment<V>(v: V) {
  return is$typed(v, id, hashEquipment)
}

export function validateEquipment<V>(v: V) {
  return validate<Equipment & V>(v, id, hashEquipment)
}

export interface OperationEquipment {
  $type?: 'social.hob.temp.recipe#operationEquipment'
  use: string
  release: boolean
}

const hashOperationEquipment = 'operationEquipment'

export function isOperationEquipment<V>(v: V) {
  return is$typed(v, id, hashOperationEquipment)
}

export function validateOperationEquipment<V>(v: V) {
  return validate<OperationEquipment & V>(v, id, hashOperationEquipment)
}

export interface Operation {
  $type?: 'social.hob.temp.recipe#operation'
  id: string
  type: 'prep' | 'cook' | 'rest' | 'assemble' | (string & {})
  action: string
  ingredients: string[]
  depends: string[]
  equipment: OperationEquipment[]
  time: TimeRange
  activeTime: TimeRange
  scalable: boolean
  temperature?: Temperature
  details?: string
  subProduct?: string
  output?: string
}

const hashOperation = 'operation'

export function isOperation<V>(v: V) {
  return is$typed(v, id, hashOperation)
}

export function validateOperation<V>(v: V) {
  return validate<Operation & V>(v, id, hashOperation)
}

export interface SubProduct {
  $type?: 'social.hob.temp.recipe#subProduct'
  id: string
  name: string
  finalOp: string
}

const hashSubProduct = 'subProduct'

export function isSubProduct<V>(v: V) {
  return is$typed(v, id, hashSubProduct)
}

export function validateSubProduct<V>(v: V) {
  return validate<SubProduct & V>(v, id, hashSubProduct)
}
