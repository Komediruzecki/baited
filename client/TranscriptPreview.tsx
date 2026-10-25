import React, { useId } from 'react';
import { Button } from './ui';
import type { TranscriptPreviewLine } from './transcript-preview';

export function TranscriptPreview({ enabled, lines, listening, onToggle, onClear }: {
  enabled: boolean;
  lines: TranscriptPreviewLine[];
  listening: boolean;
  onToggle: () => void;
  onClear: () => void;
}) {
  const id = useId();
  return <section className="transcript-preview" aria-label="Local speech test">
    <span className="small-label">LOCAL SPEECH TEST</span>
    <Button type="button" className="secondary" aria-expanded={enabled}
      aria-controls={enabled ? id : undefined} onClick={onToggle}>
      {enabled ? 'Hide transcript' : 'Show transcript'}
    </Button>
    {enabled && <div id={id} className="transcript-preview-body">
      <div className="transcript-preview-heading">
        <h4>What Moonshine heard</h4>
        <button type="button" className="transcript-clear" onClick={onClear}
          disabled={!lines.length}>Clear</button>
      </div>
      <p>Completed phrases appear after a pause. This view shows final text, not guesses while you speak.</p>
      {lines.length ? <ol className="transcript-lines" aria-label="Final transcribed phrases">
        {[...lines].reverse().map((line) => <li key={line.id}>
          <div><span>Final</span><time dateTime={new Date(line.receivedAt).toISOString()}>
            {new Date(line.receivedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
          </time></div>
          <p>{line.text}</p>
          {line.truncated && <small>Long phrase shortened in this preview.</small>}
        </li>)}
      </ol> : <p className="transcript-empty" role="status">
        {listening ? 'Say a short phrase, then pause.' : 'Enable your microphone and start a round to see new phrases.'}
      </p>}
      <small>Last 12 phrases, kept only in this tab. Hiding or reloading clears them. Keep this view out of your stream capture.</small>
    </div>}
  </section>;
}
