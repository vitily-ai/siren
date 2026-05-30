import { SirenProject } from './context';
import { IR_CONTEXT_FACTORY } from './context-internal';
import type { SirenDocument } from './document';
import { SirenCoreError } from './errors';
import { computeDelta, type PatchResult } from './patch-result';
import { cloneAndFreezeEntries } from './snapshot';
import type { SirenEntry } from './types';

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

  static fromEntries(entries: readonly SirenEntry[], ephemeralDocumentId: string): SirenBuilder {
    // Compatibility construction path: wrap entries in a document and
    // disable implicit milestone synthesis via directive.
    return SirenBuilder.fromDocuments([
      {
        id: ephemeralDocumentId,
        entries,
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

  withEntry(entry: SirenEntry, documentId = 'misc'): PatchResult {
    const existingDocument = this.documentsSnapshot.find((d) => d.id === documentId);
    if (existingDocument === undefined) {
      return this.withDocument({
        id: documentId,
        entries: [entry],
        directive: { implicitMilestone: false },
      });
    }

    return this.patchDocument(documentId, (doc) => ({
      ...doc,
      entries: [...doc.entries, entry],
    }));
  }

  patchEntry(entryId: string, fn: (res: SirenEntry) => SirenEntry): PatchResult {
    return this.patch((docs) =>
      docs.map((doc) => {
        if (!doc.entries.some((r) => r.id === entryId)) {
          return doc;
        }

        return {
          ...doc,
          entries: doc.entries.map((r) => (r.id === entryId ? fn(r) : r)),
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
    entries: cloneAndFreezeEntries(document.entries, seenEphIds),
    ...(directive !== undefined ? { directive } : {}),
  });
}

function cloneAndFreezeDocuments(documents: readonly SirenDocument[]): readonly SirenDocument[] {
  const seenEphIds = new Set<string>();
  return Object.freeze(documents.map((document) => cloneAndFreezeDocument(document, seenEphIds)));
}
