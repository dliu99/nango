import type { ProxyConfiguration } from './action.js';
import type { ZodCheckpoint, ZodMetadata, ZodModel } from './types.js';
import type { UncontrolledFetchOptions } from './uncontrolledFetch.js';
import type { GetPublicConnection, MaybePromise, MergingStrategy, OnEventType } from '@nangohq/types';
import type * as z from 'zod';

type InferZod<T> = T extends z.ZodTypeAny ? z.infer<T> : never;

// Limits
export type ConcurrencyLimit = 1 | 'max';

// Debounce
export type DebounceKeySource = { body: string } | { header: string };
export interface DebounceOptions {
    keyBy?: DebounceKeySource | DebounceKeySource[];
    windowMs: number;
    maxWindowMs?: number;
    maxEntities?: number;
    payloadMode?: 'latest' | 'all';
}

// Triggers
export type TriggerDefinition =
    | { kind: 'schedule'; frequency: string; autoStart?: boolean }
    | { kind: 'http'; input?: z.ZodTypeAny; subscriptions?: string[]; debounce?: DebounceOptions }
    | { kind: 'event'; events: OnEventType[] }
    | { kind: 'invoke'; input: z.ZodTypeAny };

export interface HttpRequest {
    path: string;
    headers: Record<string, string>;
    query: Record<string, string>;
    body: unknown;
}
export interface CoalescedInfo {
    count: number;
    firstSeenAt: Date;
    lastSeenAt: Date;
    overflowed: boolean;
}

type TriggerInput<TTrigger> = TTrigger extends { input: infer I extends z.ZodTypeAny } ? I : z.ZodVoid;

// Maps a trigger definition to the runtime trigger passed to exec
export type Trigger<TT extends TriggerDefinition> = TT extends { kind: 'schedule' }
    ? { kind: 'schedule'; payload: null }
    : TT extends { kind: 'invoke' }
      ? { kind: 'invoke'; payload: z.infer<TriggerInput<TT>> }
      : TT extends { kind: 'http' }
        ? { kind: 'http'; payload: z.infer<TriggerInput<TT>>; request: HttpRequest; subscriptions?: string[]; coalesced: CoalescedInfo }
        : TT extends { kind: 'event' }
          ? { kind: 'event'; payload: { event: OnEventType } }
          : never;

// Capability-narrowed nango
export interface NangoBase {
    log(message: string, meta?: unknown): Promise<void>;
}
export interface ConnectionCapability {
    getConnection(): Promise<GetPublicConnection['Success']>;
}
// Placeholder: when a function is not bound to a connection, it resolves/attaches one (or many) at runtime.
export interface ConnectionSearchCapability {
    searchConnections(filter?: unknown): Promise<unknown>;
}
export interface ProxyCapability {
    proxy<T = unknown>(config: ProxyConfiguration): Promise<T>;
    get<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    post<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    put<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    patch<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    delete<T = unknown>(config: Omit<ProxyConfiguration, 'method'>): Promise<T>;
    paginate<T = unknown>(config: ProxyConfiguration): AsyncGenerator<T[]>;
    uncontrolledFetch(options: UncontrolledFetchOptions): Promise<Response>;
}
export interface RecordCapability<TModels extends Record<string, ZodModel>> {
    batchSave<K extends keyof TModels>(records: z.infer<TModels[K]>[], model: K): Promise<void>;
    batchUpdate<K extends keyof TModels>(records: z.infer<TModels[K]>[], model: K): Promise<void>;
    batchDelete<K extends keyof TModels>(records: z.infer<TModels[K]>[], model: K): Promise<void>;
    getRecordsByIds<K extends keyof TModels, TKey extends string | number = string>(ids: TKey[], model: K): Promise<Map<TKey, z.infer<TModels[K]>>>;
    listRecords<K extends keyof TModels>(model: K, options?: { cursor?: string }): AsyncGenerator<z.infer<TModels[K]>>;
    setMergingStrategy(merging: MergingStrategy, model: keyof TModels): Promise<void>;
    trackDeletesStart(model: keyof TModels): Promise<void>;
    trackDeletesEnd(model: keyof TModels): Promise<void>;
}
export interface CheckpointCapability<TValue> {
    getCheckpoint(): Promise<TValue | undefined>;
    saveCheckpoint(checkpoint: TValue): Promise<void>;
    clearCheckpoint(): Promise<void>;
}
export interface MetadataCapability<TValue> {
    getMetadata(): Promise<TValue>;
    setMetadata(metadata: TValue): Promise<void>;
    updateMetadata(metadata: Partial<TValue>): Promise<void>;
}
type InferInput<T> =
    T extends CreateFunctionResponse<infer _M, infer _O, infer _Me, infer _Cp, infer Tr, infer _Ac>
        ? Tr extends { kind: 'invoke'; input: infer I extends z.ZodTypeAny }
            ? z.infer<I>
            : never
        : never;
type InferOutput<T> = T extends CreateFunctionResponse<infer _M, infer O extends z.ZodTypeAny, infer _Me, infer _Cp, infer _Tr, infer _Ac> ? z.infer<O> : never;
export interface InvokeCapability {
    invoke<T extends { type: 'function' }>(fn: T, input: InferInput<T>): Promise<InferOutput<T>>;
}

export type Nango<
    TModels extends Record<string, ZodModel>,
    TMetadata extends ZodMetadata,
    TCheckpoint extends ZodCheckpoint,
    TRequires extends Requires
> = NangoBase &
    (TRequires extends { connection: false } ? ConnectionSearchCapability : ConnectionCapability) &
    (TRequires extends { outbound: false } ? unknown : ProxyCapability) &
    (TRequires extends { invoke: true } ? InvokeCapability : unknown) &
    ([keyof TModels] extends [never] ? unknown : RecordCapability<TModels>) &
    (TCheckpoint extends undefined ? unknown : CheckpointCapability<InferZod<TCheckpoint>>) &
    (TMetadata extends undefined ? unknown : MetadataCapability<InferZod<TMetadata>>);

// Function
export interface Requires {
    connection?: boolean;
    outbound?: boolean;
    invoke?: boolean;
}
export interface FunctionCapabilities {
    useRecords: boolean;
    useCheckpoints: boolean;
    useMetadata: boolean;
    useOutbound: boolean;
    useInvoke: boolean;
}
export interface CreateFunctionProps<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition,
    TRequires extends Requires = { outbound: true; connection: true }
> {
    description: string;
    version?: string;
    scopes?: string[];
    output?: TOutput;
    data?: {
        models?: TModels;
        metadata?: TMetadata;
        checkpoint?: TCheckpoint;
    };
    trigger: TTrigger;
    requires?: TRequires;
    limits?: {
        concurrency?: TTrigger extends { kind: 'schedule' } ? 1 : ConcurrencyLimit;
    };
    exec: (nango: Nango<TModels, TMetadata, TCheckpoint, TRequires>, trigger: Trigger<TTrigger>) => MaybePromise<z.infer<TOutput>>;
}
export interface CreateFunctionResponse<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition,
    TRequires extends Requires = { outbound: true; connection: true }
> extends CreateFunctionProps<TModels, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
    type: 'function';
    capabilities: FunctionCapabilities;
}

export function createFunction<
    TModels extends Record<string, ZodModel> = Record<never, ZodModel>,
    TOutput extends z.ZodTypeAny = z.ZodVoid,
    TMetadata extends ZodMetadata = undefined,
    TCheckpoint extends ZodCheckpoint = undefined,
    TTrigger extends TriggerDefinition = TriggerDefinition,
    TRequires extends Requires = { outbound: true; connection: true }
>(
    params: CreateFunctionProps<TModels, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires>
): CreateFunctionResponse<TModels, TOutput, TMetadata, TCheckpoint, TTrigger, TRequires> {
    const models = params.data?.models;
    const capabilities: FunctionCapabilities = {
        useRecords: !!models && Object.keys(models).length > 0,
        useCheckpoints: !!params.data?.checkpoint,
        useMetadata: !!params.data?.metadata,
        useOutbound: params.requires?.outbound !== false,
        useInvoke: params.requires?.invoke === true
    };
    return { type: 'function', ...params, capabilities };
}
