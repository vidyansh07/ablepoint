import { useCurrentUser, useDocumentOperation, type DocumentActionComponent } from 'sanity';
import { approveAvailability, buildApprovalPatch } from './approve-logic';
import { readStudioEnvLoose } from './schemas/reviewers';

/**
 * "Approve for publication": records the reviewer, the time and a hash of the document's content on the draft.
 * Writes ONLY the four approval fields (via `approvalFields`). It does not publish: a publisher publishes afterwards.
 * It does not run Studio validation (the Publish action does).
 *
 * STATUS: type-checked against Sanity 6.21 only. Not exercised in a running Studio.
 */
export const ApproveForPublicationAction: DocumentActionComponent = (props) => {
  const user = useCurrentUser();
  const { patch } = useDocumentOperation(props.id, props.type);
  const doc = (props.draft ?? props.published) as Record<string, unknown> | null;

  const availability = approveAvailability({
    userId: user?.id,
    allowList: readStudioEnvLoose().reviewerIds,
    doc,
    isVersion: !!props.version,
    patchDisabled: patch.disabled,
  });

  return {
    label: 'Approve for publication',
    tone: 'positive',
    disabled: !availability.enabled,
    title: availability.enabled ? availability.title : availability.reason,
    onHandle: () => {
      if (!availability.enabled || !doc || !user) return;
      const fields = buildApprovalPatch(doc, user.id, new Date());
      // With no draft yet, pass the published document so Sanity creates the draft from it before patching.
      patch.execute([{ set: fields }], props.draft ? undefined : (props.published as Record<string, unknown> | undefined));
      props.onComplete();
    },
  };
};
ApproveForPublicationAction.displayName = 'ApproveForPublicationAction';
