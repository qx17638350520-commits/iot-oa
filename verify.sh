#!/bin/sh
set -eu
cd "$(dirname "$0")"
for f in dist/static/*.js; do node --check "$f"; done
for f in test_multimodal.cjs test_phase2_migration.cjs test_full_phase2.cjs test_training_record.cjs test_bank_migration.cjs test_logistics.cjs test_logistics_dom.cjs test_logic.js test_exam_assignments.cjs test_admin_classes.cjs test_persistence.cjs test_learning.cjs test_annotation_flow.cjs test_twin_demo_flows.cjs test_twin_lifecycle.cjs test_detection.cjs extras.test.cjs hardware.test.cjs application.test.cjs transfer.test.cjs; do node "$f"; done
