export const EPH_ID: unique symbol = Symbol('sirenEphId');

let next = 0;

export function stampEphId(resource: object): void {
  Object.defineProperty(resource, EPH_ID, {
    value: 'r' + String(++next),
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export function getEphId(resource: object): string | undefined {
  return (resource as any)[EPH_ID];
}
