import React from 'react';

/** Keep capture failures next to its restart control, independent of action errors. */
export function MicrophoneFeedback({ issue, recovering }: { issue: string; recovering: boolean }) {
  if (issue) return <div className="error-banner mic-feedback" role="alert">{issue}</div>;
  if (recovering) return <p className="mic-feedback" role="status">Retrying the microphone check. Keep this Studio tab open.</p>;
  return null;
}
