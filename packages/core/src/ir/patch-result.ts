import type { SirenBuilder } from './assembly';
import type { SirenDocument } from './document';
import { getEphId } from './eph-id';
import type { Resource } from './types';

export type ChangeMode = 'created' | 'updated' | 'deleted';

export interface ResourceChange {
  resourceId: string;
  mode: ChangeMode;
}

export interface DocumentChange {
  documentId: string;
  mode: ChangeMode;
  resources: readonly ResourceChange[];
}

export interface PatchResult {
  builder: SirenBuilder;
  changes: readonly DocumentChange[];
}

export function computeDelta(
  oldDocs: readonly SirenDocument[],
  newDocs: readonly SirenDocument[],
): readonly DocumentChange[] {
  const changes: DocumentChange[] = [];

  const oldDocMap = new Map<string, SirenDocument>();
  for (const doc of oldDocs) {
    oldDocMap.set(doc.id, doc);
  }

  for (const newDoc of newDocs) {
    const oldDoc = oldDocMap.get(newDoc.id);

    if (!oldDoc) {
      // Document is created
      changes.push({
        documentId: newDoc.id,
        mode: 'created',
        resources: newDoc.resources.map((r) => ({ resourceId: r.id, mode: 'created' })),
      });
    } else {
      // Document exists in both, check for changes
      oldDocMap.delete(newDoc.id); // Marked as processed

      const resourceChanges: ResourceChange[] = [];
      const oldResMap = new Map<string, Resource>();
      for (const r of oldDoc.resources) {
        oldResMap.set(r.id, r);
      }

      for (const newRes of newDoc.resources) {
        const oldRes = oldResMap.get(newRes.id);
        if (!oldRes) {
          resourceChanges.push({ resourceId: newRes.id, mode: 'created' });
        } else {
          oldResMap.delete(newRes.id);
          const oldEphId = getEphId(oldRes);
          const newEphId = getEphId(newRes);
          if (oldEphId !== newEphId) {
            resourceChanges.push({ resourceId: newRes.id, mode: 'updated' });
          }
        }
      }

      for (const oldRes of oldResMap.values()) {
        resourceChanges.push({ resourceId: oldRes.id, mode: 'deleted' });
      }

      let directiveChanged = false;
      const oldDir = oldDoc.directive;
      const newDir = newDoc.directive;
      if (oldDir?.implicitMilestone !== newDir?.implicitMilestone) {
        directiveChanged = true;
      }

      if (resourceChanges.length > 0 || directiveChanged) {
        changes.push({
          documentId: newDoc.id,
          mode: 'updated',
          resources: resourceChanges,
        });
      }
    }
  }

  // Any remaining docs in oldDocMap were deleted
  for (const [docId, oldDoc] of oldDocMap.entries()) {
    changes.push({
      documentId: docId,
      mode: 'deleted',
      resources: oldDoc.resources.map((r) => ({ resourceId: r.id, mode: 'deleted' })),
    });
  }

  return changes;
}
