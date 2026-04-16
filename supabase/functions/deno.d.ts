// Deno global type declarations for IDE support
// Runtime types are provided by Deno itself — this file silences IDE errors

declare namespace Deno {
  export const env: {
    get(key: string): string | undefined;
    set(key: string, value: string): void;
    delete(key: string): void;
    toObject(): { [key: string]: string };
  };

  export function serve(
    handler: (request: Request) => Response | Promise<Response>,
    options?: {
      port?: number;
      hostname?: string;
      onListen?: (params: { hostname: string; port: number }) => void;
    }
  ): void;

  export interface TestDefinition {
    fn: () => void | Promise<void>;
    name: string;
    ignore?: boolean;
    only?: boolean;
    sanitizeOps?: boolean;
    sanitizeResources?: boolean;
  }

  export function test(
    name: string,
    fn: () => void | Promise<void>
  ): void;

  export function test(t: TestDefinition): void;
}
