export class SirenCoreError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SirenCoreError';
  }
}
