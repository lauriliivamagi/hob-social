/**
 * GENERATED CODE - DO NOT MODIFY
 */
import {
  XrpcClient,
  type FetchHandler,
  type FetchHandlerOptions,
} from '@atproto/xrpc'
import { schemas } from './lexicons.js'
import { CID } from 'multiformats/cid'
import { type OmitKey, type Un$Typed } from './util.js'
import * as SocialHobTempRecipe from './types/social/hob/temp/recipe.js'

export * as SocialHobTempRecipe from './types/social/hob/temp/recipe.js'

export class AtpBaseClient extends XrpcClient {
  social: SocialNS

  constructor(options: FetchHandler | FetchHandlerOptions) {
    super(options, schemas)
    this.social = new SocialNS(this)
  }

  /** @deprecated use `this` instead */
  get xrpc(): XrpcClient {
    return this
  }
}

export class SocialNS {
  _client: XrpcClient
  hob: SocialHobNS

  constructor(client: XrpcClient) {
    this._client = client
    this.hob = new SocialHobNS(client)
  }
}

export class SocialHobNS {
  _client: XrpcClient
  temp: SocialHobTempNS

  constructor(client: XrpcClient) {
    this._client = client
    this.temp = new SocialHobTempNS(client)
  }
}

export class SocialHobTempNS {
  _client: XrpcClient
  recipe: SocialHobTempRecipeRecord

  constructor(client: XrpcClient) {
    this._client = client
    this.recipe = new SocialHobTempRecipeRecord(client)
  }
}

export class SocialHobTempRecipeRecord {
  _client: XrpcClient

  constructor(client: XrpcClient) {
    this._client = client
  }

  async list(
    params: OmitKey<ComAtprotoRepoListRecords.QueryParams, 'collection'>,
  ): Promise<{
    cursor?: string
    records: { uri: string; value: SocialHobTempRecipe.Record }[]
  }> {
    const res = await this._client.call('com.atproto.repo.listRecords', {
      collection: 'social.hob.temp.recipe',
      ...params,
    })
    return res.data
  }

  async get(
    params: OmitKey<ComAtprotoRepoGetRecord.QueryParams, 'collection'>,
  ): Promise<{ uri: string; cid: string; value: SocialHobTempRecipe.Record }> {
    const res = await this._client.call('com.atproto.repo.getRecord', {
      collection: 'social.hob.temp.recipe',
      ...params,
    })
    return res.data
  }

  async create(
    params: OmitKey<
      ComAtprotoRepoCreateRecord.InputSchema,
      'collection' | 'record'
    >,
    record: Un$Typed<SocialHobTempRecipe.Record>,
    headers?: Record<string, string>,
  ): Promise<{ uri: string; cid: string }> {
    const collection = 'social.hob.temp.recipe'
    const res = await this._client.call(
      'com.atproto.repo.createRecord',
      undefined,
      { collection, ...params, record: { ...record, $type: collection } },
      { encoding: 'application/json', headers },
    )
    return res.data
  }

  async put(
    params: OmitKey<
      ComAtprotoRepoPutRecord.InputSchema,
      'collection' | 'record'
    >,
    record: Un$Typed<SocialHobTempRecipe.Record>,
    headers?: Record<string, string>,
  ): Promise<{ uri: string; cid: string }> {
    const collection = 'social.hob.temp.recipe'
    const res = await this._client.call(
      'com.atproto.repo.putRecord',
      undefined,
      { collection, ...params, record: { ...record, $type: collection } },
      { encoding: 'application/json', headers },
    )
    return res.data
  }

  async delete(
    params: OmitKey<ComAtprotoRepoDeleteRecord.InputSchema, 'collection'>,
    headers?: Record<string, string>,
  ): Promise<void> {
    await this._client.call(
      'com.atproto.repo.deleteRecord',
      undefined,
      { collection: 'social.hob.temp.recipe', ...params },
      { headers },
    )
  }
}
