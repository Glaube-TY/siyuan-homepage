export type HomepageMcpJsonSchema = Record<string, unknown>;

export interface HomepageMcpCapabilityEffects {
  localRead?: boolean;
  localWrite?: boolean;
  dataEgress?: boolean;
  externalCost?: boolean;
}

export interface HomepageMcpCapabilityConfig {
  title?: string;
  description: string;
  inputSchema: HomepageMcpJsonSchema;
  outputSchema?: HomepageMcpJsonSchema;
  effects?: HomepageMcpCapabilityEffects;
  actionEffects?: Record<string, HomepageMcpCapabilityEffects>;
}

export type HomepageMcpCapabilityHandler = (
  input: Record<string, unknown>,
) => unknown | Promise<unknown>;

export type HomepageMcpRegisteredCapability = Record<string, unknown>;

/** 官方 `siyuan.agent` 的最小结构化注册接口。 */
export interface HomepageMcpAgent {
  registerCapability(
    name: string,
    config: HomepageMcpCapabilityConfig,
    handler: HomepageMcpCapabilityHandler,
  ): Promise<HomepageMcpRegisteredCapability>;
  unregisterCapability(name: string): Promise<void>;
}
