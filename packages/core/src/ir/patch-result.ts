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
      const oldResMap = new Map<string, Resource[]>();
      for (const r of oldDoc.resources) {
        const arr = oldResMap.get(r.id);
        if (arr) {
          arr.push(r);
        } else {
          oldResMap.set(r.id, [r]);
        }
      }

      const newResMap = new Map<string, Resource[]>();
      for (const r of newDoc.resources) {
        const arr = newResMap.get(r.id);
        if (arr) {
          arr.push(r);
        } else {
          newResMap.set(r.id, [r]);
        }
      }

      for (const [resId, newResArray] of newResMap.entries()) {
        const oldResArray = oldResMap.get(resId);
        if (!oldResArray || oldResArray.length === 0) {
          for (const _ of newResArray) {
            resourceChanges.push({ resourceId: resId, mode: 'created' });
          }
        } else {
          // 1. Match exact ephIds first
          const unmatchedNew: Resource[] = [];
          for (const newRes of newResArray) {
            const newEphId = getEphId(newRes);
            const matchIndex = oldResArray.findIndex((r) => getEphId(r) === newEphId);
            if (matchIndex !== -1) {
              // Exact match found; remove from old queue (no 'updated' emitted here, it is unchanged)
              oldResArray.splice(matchIndex, 1);
            } else {
              unmatchedNew.push(newRes);
            }
          }

          // 2. Unmatched items are paired as 'updated'
          let matchedCount = 0;
          while (matchedCount < unmatchedNew.length && oldResArray.length > 0) {
            resourceChanges.push({ resourceId: resId, mode: 'updated' });
            oldResArray.shift(); // consume an old resource
            matchedCount++;
          }

          // 3. Any leftover unmatched new items are 'created'
          while (matchedCount < unmatchedNew.length) {
            resourceChanges.push({ resourceId: resId, mode: 'created' });
            matchedCount++;
          }
        }
        // Remove from old map to track what's completely left over for deletion
        oldResMap.delete(resId);
      }

      for (const oldResArray of oldResMap.values()) {
        for (const oldRes of oldResArray) {
          resourceChanges.push({ resourceId: oldRes.id, mode: 'deleted' });
        }
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
