/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  type LexiconDoc,
  Lexicons,
  ValidationError,
  type ValidationResult,
} from '@atproto/lexicon'
import { type $Typed, is$typed, maybe$typed } from './util.js'

export const schemaDict = {
  SocialHobTempRecipe: {
    lexicon: 1,
    id: 'social.hob.temp.recipe',
    description:
      'A Hob recipe: metadata plus a full DAG of cooking operations. UNSTABLE: the `.temp.` namespace segment indicates the schema may break. It is dropped once the schema stabilizes.\n\nDecimal encoding: AT Protocol (DAG-CBOR) does not support floats. Decimal fields are encoded as `{value: integer, scale: integer}` where the real value equals `value / 10^scale` (power-of-ten exponent, standard fixed-point). Scale 0 means plain integer.',
    defs: {
      main: {
        type: 'record',
        description:
          "A single recipe published to the author's PDS. One rkey per recipe slug, so republishing overwrites rather than duplicating.",
        key: 'any',
        record: {
          type: 'object',
          required: [
            'meta',
            'ingredients',
            'equipment',
            'operations',
            'subProducts',
            'createdAt',
          ],
          properties: {
            meta: {
              type: 'ref',
              ref: 'lex:social.hob.temp.recipe#meta',
            },
            ingredients: {
              type: 'array',
              minLength: 1,
              items: {
                type: 'ref',
                ref: 'lex:social.hob.temp.recipe#ingredient',
              },
            },
            equipment: {
              type: 'array',
              items: {
                type: 'ref',
                ref: 'lex:social.hob.temp.recipe#equipment',
              },
            },
            operations: {
              type: 'array',
              minLength: 1,
              items: {
                type: 'ref',
                ref: 'lex:social.hob.temp.recipe#operation',
              },
            },
            subProducts: {
              type: 'array',
              items: {
                type: 'ref',
                ref: 'lex:social.hob.temp.recipe#subProduct',
              },
            },
            createdAt: {
              type: 'string',
              format: 'datetime',
              description:
                'Client-declared timestamp when the record was published.',
            },
          },
        },
      },
      meta: {
        type: 'object',
        required: [
          'title',
          'slug',
          'language',
          'originalText',
          'tags',
          'servings',
          'totalTime',
          'difficulty',
        ],
        properties: {
          title: {
            type: 'string',
            minLength: 1,
            maxLength: 256,
          },
          slug: {
            type: 'string',
            description: 'URL-safe identifier. Matches the record rkey.',
            maxLength: 512,
          },
          language: {
            type: 'string',
            format: 'language',
            description: 'ISO 639-1 two-letter language code.',
          },
          source: {
            type: 'string',
            format: 'uri',
            description: 'Optional URL of the original recipe.',
          },
          originalText: {
            type: 'string',
            minLength: 1,
            description:
              'Full original recipe text in markdown for side-by-side review.',
          },
          tags: {
            type: 'array',
            items: {
              type: 'string',
              maxLength: 64,
            },
          },
          servings: {
            type: 'integer',
            minimum: 1,
          },
          totalTime: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#totalTime',
          },
          difficulty: {
            type: 'string',
            knownValues: ['easy', 'medium', 'hard'],
          },
          energyTier: {
            type: 'string',
            knownValues: ['zombie', 'moderate', 'project'],
            description: 'Derived from DAG decision count + active time.',
          },
          notes: {
            type: 'string',
          },
        },
      },
      totalTime: {
        type: 'object',
        required: ['relaxed', 'optimized'],
        properties: {
          relaxed: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#timeRange',
          },
          optimized: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#timeRange',
          },
        },
      },
      timeRange: {
        type: 'object',
        description:
          'Duration in integer seconds. `max` is optional (exact duration when omitted).',
        required: ['min'],
        properties: {
          min: {
            type: 'integer',
            minimum: 0,
          },
          max: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
      decimal: {
        type: 'object',
        description:
          'Fixed-point decimal. Real value = value / 10^scale. Scale 0 means plain integer.',
        required: ['value', 'scale'],
        properties: {
          value: {
            type: 'integer',
          },
          scale: {
            type: 'integer',
            minimum: 0,
          },
        },
      },
      quantity: {
        type: 'object',
        description: 'Amount with unit, optionally a range.',
        required: ['min', 'unit'],
        properties: {
          min: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#decimal',
          },
          max: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#decimal',
          },
          unit: {
            type: 'string',
            minLength: 1,
          },
        },
      },
      capacity: {
        type: 'object',
        description:
          'Equipment capacity. Positive value with unit (e.g., 5 L, 30 cm).',
        required: ['min', 'unit'],
        properties: {
          min: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#decimal',
          },
          unit: {
            type: 'string',
            minLength: 1,
          },
        },
      },
      temperature: {
        type: 'object',
        required: ['min', 'unit'],
        properties: {
          min: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#decimal',
          },
          max: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#decimal',
          },
          unit: {
            type: 'string',
            knownValues: ['C', 'F'],
          },
        },
      },
      ingredientBase: {
        type: 'object',
        required: ['id', 'name', 'group'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
          },
          name: {
            type: 'string',
            minLength: 1,
          },
          quantity: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#quantity',
          },
          group: {
            type: 'string',
            minLength: 1,
          },
        },
      },
      ingredient: {
        type: 'object',
        required: ['id', 'name', 'group'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
          },
          name: {
            type: 'string',
            minLength: 1,
          },
          quantity: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#quantity',
          },
          group: {
            type: 'string',
            minLength: 1,
          },
          alternatives: {
            type: 'array',
            items: {
              type: 'ref',
              ref: 'lex:social.hob.temp.recipe#ingredientBase',
            },
          },
        },
      },
      equipment: {
        type: 'object',
        required: ['id', 'name', 'count'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
          },
          name: {
            type: 'string',
            minLength: 1,
          },
          count: {
            type: 'integer',
            minimum: 1,
          },
          capacity: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#capacity',
          },
        },
      },
      operationEquipment: {
        type: 'object',
        required: ['use', 'release'],
        properties: {
          use: {
            type: 'string',
            minLength: 1,
          },
          release: {
            type: 'boolean',
          },
        },
      },
      operation: {
        type: 'object',
        required: [
          'id',
          'type',
          'action',
          'ingredients',
          'depends',
          'equipment',
          'time',
          'activeTime',
          'scalable',
        ],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
          },
          type: {
            type: 'string',
            knownValues: ['prep', 'cook', 'rest', 'assemble'],
          },
          action: {
            type: 'string',
            minLength: 1,
          },
          ingredients: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
            },
          },
          depends: {
            type: 'array',
            items: {
              type: 'string',
              minLength: 1,
            },
          },
          equipment: {
            type: 'array',
            items: {
              type: 'ref',
              ref: 'lex:social.hob.temp.recipe#operationEquipment',
            },
          },
          time: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#timeRange',
          },
          activeTime: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#timeRange',
          },
          scalable: {
            type: 'boolean',
          },
          temperature: {
            type: 'ref',
            ref: 'lex:social.hob.temp.recipe#temperature',
          },
          details: {
            type: 'string',
          },
          subProduct: {
            type: 'string',
          },
          output: {
            type: 'string',
          },
        },
      },
      subProduct: {
        type: 'object',
        required: ['id', 'name', 'finalOp'],
        properties: {
          id: {
            type: 'string',
            minLength: 1,
          },
          name: {
            type: 'string',
            minLength: 1,
          },
          finalOp: {
            type: 'string',
            minLength: 1,
          },
        },
      },
    },
  },
} as const satisfies Record<string, LexiconDoc>
export const schemas = Object.values(schemaDict) satisfies LexiconDoc[]
export const lexicons: Lexicons = new Lexicons(schemas)

export function validate<T extends { $type: string }>(
  v: unknown,
  id: string,
  hash: string,
  requiredType: true,
): ValidationResult<T>
export function validate<T extends { $type?: string }>(
  v: unknown,
  id: string,
  hash: string,
  requiredType?: false,
): ValidationResult<T>
export function validate(
  v: unknown,
  id: string,
  hash: string,
  requiredType?: boolean,
): ValidationResult {
  return (requiredType ? is$typed : maybe$typed)(v, id, hash)
    ? lexicons.validate(`${id}#${hash}`, v)
    : {
        success: false,
        error: new ValidationError(
          `Must be an object with "${hash === 'main' ? id : `${id}#${hash}`}" $type property`,
        ),
      }
}

export const ids = {
  SocialHobTempRecipe: 'social.hob.temp.recipe',
} as const
