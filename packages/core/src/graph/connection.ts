// Wire types. validateConnection (the wire-time refuse-to-net guard) is added in
// Plan 04 Task 2.
export interface PortRef {
  readonly nodeId: string;
  readonly portId: string;
}

export interface Connection {
  readonly from: PortRef;
  readonly to: PortRef;
}

export type WireError = { code: 'dimension' | 'boundary'; message: string };
