export const EPH_ID: unique symbol = Symbol('sirenEphId');

type Stamped = object & { [EPH_ID]?: string };

let next = 0;

export function stampEphId<T extends object>(resource: T): asserts resource is T & Stamped {
  Object.defineProperty(resource, EPH_ID, {
    value: `r${String(++next)}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export function getEphId(resource: object): string | undefined {
  return (resource as Stamped)[EPH_ID];
}
