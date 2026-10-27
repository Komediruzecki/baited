# Glass reference

Reference: [Ania Kubow’s Instagram demonstration](https://www.instagram.com/reel/DcwFH02NF3i/), fetched 2026-10-27. Local ffprobe measured 45.299274 seconds at 720×1280; Instagram’s missing duration produced an incorrect zero-second wrapper receipt.

The demonstration displaces the visible backing through an SVG noise filter, then applies a small blur and saturation. Straight diagonal stripes bend into broad waves inside translucent panes, while foreground text and icons stay sharp. A thin white inset highlight defines the lit edge.

Visible example values: 320×200px pane, 24px corners, 3px blur, 180% saturation, and inset shadow offsets/blur 0/1/0px with white alpha 0x5c. The blur-only comparator uses 12px. A separate slider visibly reaches displacement scales 0–220; this does not establish the final filter’s value or configured maximum.

The SVG’s right edge is cropped: its complete noise frequency, displacement scale, channels, and output attributes cannot be read. Those choices remain unverified. Opus specified Baited’s adaptation in a separate 23-minute design pass. Local Chromium inspection confirmed visible line displacement inside the block with sharp foreground text and artwork; this does not establish cross-browser or physical-device acceptance. Third-party video, frames, and transcript remain outside Git.
