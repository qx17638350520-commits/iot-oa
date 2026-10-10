#!/bin/sh
set -eu
cd "$(dirname "$0")"
for f in dist/static/*.js; do node --check "$f"; done
node --check dist/static/ocr/local-ocr.js
for f in test_preset_vision.cjs test_preset_extensions.cjs test_preset_routes.cjs test_preset_logistics_panels.cjs test_preset_mode.cjs test_preset_data.cjs test_preset_replay.cjs test_local_ocr.cjs test_multimodal.cjs test_phase2_migration.cjs test_full_phase2.cjs test_training_record.cjs test_bank_migration.cjs test_logistics.cjs test_logistics_dom.cjs test_logic.js test_exam_assignments.cjs test_admin_classes.cjs test_persistence.cjs test_learning.cjs test_annotation_flow.cjs test_twin_demo_flows.cjs test_twin_lifecycle.cjs test_detection.cjs extras.test.cjs hardware.test.cjs application.test.cjs transfer.test.cjs; do echo "Running $f"; node "$f"; done
echo "PASS: complete logistics verification suite (28 Node test files + syntax checks)."
