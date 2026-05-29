export const EPH_ID: unique symbol = Symbol('sirenEphId');

type Stamped = object & { [EPH_ID]?: string };

let next = 0;

export function stampEphId<T extends object>(entry: T): asserts entry is T & Stamped {
  Object.defineProperty(entry, EPH_ID, {
    value: `r${String(++next)}`,
    enumerable: false,
    writable: false,
    configurable: false,
  });
}

export function getEphId(entry: object): string | undefined {
  return (entry as Stamped)[EPH_ID];
}
