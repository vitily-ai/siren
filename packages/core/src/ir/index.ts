/**
 * IR module exports
 */

export type { 
  PrimitiveValue,
  ResourceReference, 
  ArrayValue, 
  AttributeValue,
  Attribute,
  ResourceType,
  Resource,
  Document,
} from './types.js';
export { isReference, isArray, isPrimitive } from './types.js';
