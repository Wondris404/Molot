/** Future connectors must be opt-in. No provider performs network calls in this release. */
export interface StorageProvider {
  readonly id: string;
  list(): Promise<{id:string;name:string;modifiedAt:string}[]>;
  read(id:string):Promise<Uint8Array>;
}
export const enabledRemoteProviders:StorageProvider[]=[];
