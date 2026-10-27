# Viewer room and OBS source

Mode: Operate. This extends the landing's selected card (Glass face, Mosaic back), Russo One targets in each item's ink, pixel artwork, the violet ground and small yellow accents. The audience needs to recognize the secret word immediately; the broadcaster needs a readable clock without seeing that word.

The web viewer uses one actual game card, the same Glass card as the Extension overlay, with its clues on the landing's rail and the clock in its footer. On desktop, instructions and session scores sit beside it; below 860px they follow it. Off-limits words have a struck label and remain readable. Yellow marks the target and confirmed win, while violet identifies a live round and links. Support information stays on the page without another stack of containers.

The OBS source retains its existing upper-left position for scene compatibility. Its opaque HUD sits on a transparent canvas, with 14 px state labels, 20 px headlines and a 44 px clock. Mission progress is a compact row inside the same frame. Only caught and escaped results get the large reveal below the HUD. Pending, overturned, skipped and ended words are removed at the API boundary and independently guarded in the UI. Paused, reconnecting and winning states have text labels in addition to color.

The rounded card edges match the approved landing rather than the earlier clipped-corner dashboard. Motion is limited to the existing timer and a short result reveal; reduced motion removes animation and confetti. No idle ornament, sound or simulated activity is added.

State coverage by existing markup: waiting, active, paused, final-speech settling, broadcaster catch review, caught, escaped, overturned, mission completion/failure, reconnecting and room error. The stylesheet is scoped to `.viewer-room`, OBS classes and the existing public error view, leaving the privacy article and streamer studio to their own style owners.

The 26 October Opus review prompted the typography, card and privacy changes. Local browser fixtures and regression tests cover these states; a real OBS capture still needs acceptance. Source and layout tests cannot establish physical device or broadcast behavior.
