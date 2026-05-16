import { SirenProject } from './context';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { SirenDocument } from './document';
import { SirenCoreError } from './errors';
import { computeDelta, type PatchResult } from './patch-result';
import { cloneAndFreezeResources } from './snapshot';
import type { Resource } from './types';

export class SirenBuilder {
  private constructor(private readonly documentsSnapshot: readonly SirenDocument[]) {
    Object.freeze(this);
  }

  static fromDocuments(documents: readonly SirenDocument[]): SirenBuilder {
    const seen = new Set<string>();
    for (const doc of documents) {
      if (seen.has(doc.id)) {
        throw new SirenCoreError(`Duplicate document id: "${doc.id}"`);
      }
      seen.add(doc.id);
    }
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

  patch(fn: (docs: readonly SirenDocument[]) => readonly SirenDocument[]): PatchResult {
    const newBuilder = SirenBuilder.fromDocuments(fn(this.documentsSnapshot));
    const changes = computeDelta(this.documentsSnapshot, newBuilder.documents);
    return { builder: newBuilder, changes };
  }

  withDocument(doc: SirenDocument): PatchResult {
    return this.patch((docs) => {
      return [...docs, doc];
    });
  }

  patchDocument(documentId: string, fn: (doc: SirenDocument) => SirenDocument): PatchResult {
    return this.patch((docs) => docs.map((d) => (d.id === documentId ? fn(d) : d)));
  }

  withResource(resource: Resource, documentId = 'misc'): PatchResult {
    const existingDocument = this.documentsSnapshot.find((d) => d.id === documentId);
    if (existingDocument === undefined) {
      return this.withDocument({
        id: documentId,
        resources: [resource],
        directive: { implicitMilestone: false },
      });
    }

    return this.patchDocument(documentId, (doc) => ({
      ...doc,
      resources: [...doc.resources, resource],
    }));
  }

  patchResource(resourceId: string, fn: (res: Resource) => Resource): PatchResult {
    return this.patch((docs) =>
      docs.map((doc) => {
        if (!doc.resources.some((r) => r.id === resourceId)) {
          return doc;
        }

        return {
          ...doc,
          resources: doc.resources.map((r) => (r.id === resourceId ? fn(r) : r)),
        };
      }),
    );
  }

  build(): SirenProject {
    return SirenProject[IR_CONTEXT_FACTORY](this.documentsSnapshot);
  }
}

function cloneAndFreezeDocument(document: SirenDocument, seenEphIds: Set<string>): SirenDocument {
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
    resources: cloneAndFreezeResources(document.resources, seenEphIds),
    ...(directive !== undefined ? { directive } : {}),
  });
}

function cloneAndFreezeDocuments(documents: readonly SirenDocument[]): readonly SirenDocument[] {
  const seenEphIds = new Set<string>();
  return Object.freeze(documents.map((document) => cloneAndFreezeDocument(document, seenEphIds)));
}
