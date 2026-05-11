import { SirenProject } from './context';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { SirenDocument } from './document';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

export class SirenBuilder {
  private constructor(private readonly documentsSnapshot: readonly SirenDocument[]) {
    Object.freeze(this);
  }

  static fromDocuments(documents: readonly SirenDocument[]): SirenBuilder {
    return new SirenBuilder(cloneAndFreezeDocuments(documents));
  }

  static fromResources(resources: readonly Resource[], ephemeralDocumentId: string): SirenBuilder {
    // Compatibility construction path: wrap resources in a document and
    // disable implicit milestone synthesis via directive.
    return SirenBuilder.fromDocuments([
      {
        id: ephemeralDocumentId,
        resources,
        directive: { implicitMilestone: false },
      },
    ]);
  }

  get documents(): readonly SirenDocument[] {
    return this.documentsSnapshot;
  }

  build(): SirenProject {
    return SirenProject[IR_CONTEXT_FACTORY](this.documentsSnapshot);
  }
}

function cloneAndFreezeDocument(document: SirenDocument): SirenDocument {
  const directive =
    document.directive === undefined
      ? undefined
      : Object.freeze({
          ...(document.directive.implicitMilestone !== undefined
            ? { implicitMilestone: document.directive.implicitMilestone }
            : {}),
        });

  return Object.freeze({
    id: document.id,
    resources: cloneAndFreezeResources(document.resources),
    ...(directive !== undefined ? { directive } : {}),
  });
}

function cloneAndFreezeDocuments(documents: readonly SirenDocument[]): readonly SirenDocument[] {
  return Object.freeze(documents.map((document) => cloneAndFreezeDocument(document)));
}
