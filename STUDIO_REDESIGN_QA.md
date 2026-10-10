# Modern studio redesign and coverage restoration

This batch follows the earlier PHOTO_WORKSPACE_QA.md pass.

## Material layout changes
- Unified graphite navigation, light warm canvas, consistent borders/radii and restrained blue accents.
- Replaced the first-screen dashboard card wall with an authentic photographic hero and three task-first launch rows. The complete former overview remains expandable, with its counters, records and actions preserved.
- Changed the photo workspace to a large canvas with a side inspector and a bottom horizontal filmstrip; toolbar, steps and provenance have quieter hierarchy.
- Retained keyboard focus styles and responsive rules. Supporting working text remains legible rather than disappearing into low-contrast grey.

## Restored teaching coverage
- Multimodal → 专项教学样例 restores all original six teaching tabs, including engineering drawings, nameplates, multilingual safety text, rotated/font OCR, fixed 0.60 MPa gauge mapping, original instance segmentation, gesture, GAN concepts and ONNX deployment storyboards.
- Annotation → 专项教学标注 restores the six original annotation scenes including devices, tools, electrical parts, mechanical parts, raw materials and pipe connections.
- Added two authentic industrial raw-material photos. Total: 12 original photos, five reference classes.
- New steel images: Fumikas Sagisavas / CC0 1.0; Methem (Mikko J. Putkonen) / public-domain dedication. Exact sources, attribution and hashes are in industrial-photos/manifest.json.
- Photo observations remain manual presets. Teaching diagrams remain explicitly labelled diagrams. No actual training, inference or live capture was performed.

## Verification
- test_preset_coverage.cjs verifies restored route reachability, all four OCR samples, fixed gauge reading, original two-instance segmentation, all six annotation categories, photo-first return and cleanup.
- test_preset_dashboard.cjs verifies both hero sources, launch actions and preservation of the former overview.
- Existing photo, vision, route and mode suites passed in both apps; all 12 photos have local assets and valid coordinates.
- DOM-only browser QA at 1165px: both hero images and the two new steel photos loaded; all six launch cards and both primary hero buttons navigated correctly; both old overviews expanded.
- Photo image/overlay geometry matched exactly; the two-column inspector layout was confirmed. All six original multimodal tabs had no horizontal page/main overflow.
- Browser parsed 158 studio stylesheet rules. No application-origin console errors were observed. Logistics analytics, cold-chain, drone, twin and knowledge extension content remained available.

## Limits
- No screenshots or recordings were captured; no pixel-based aesthetic claim is made.
- Mobile viewport rendering remains untested because the supported browser interface did not expose resizing without screenshot-dependent native interaction.
- LabelMe application import, model quality and procurement acceptance remain outside this UI verification.
