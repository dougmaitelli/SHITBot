export interface ManagedMessage {
  id: string;
  pin(): Promise<unknown>;
  delete(): Promise<unknown>;
}
