#!/bin/sh
set -eu
cd "$(dirname "$0")"
for f in static/*.js; do node --check "$f"; done
python3 test_server.py
for f in test_multimodal.cjs test_phase2_migration.cjs test_full_phase2.cjs test_training_record.cjs test_bank_migration.cjs test_dashboard.cjs test_logic.js test_exam_assignments.cjs test_admin_classes.cjs test_persistence.cjs test_learning.cjs test_annotation_flow.cjs test_twin_demo_flows.cjs test_twin_lifecycle.cjs test_detection.cjs test_transfer.cjs; do
  echo "Running $f"
  node "$f"
done
echo "PASS: complete IoT verification suite (Python API tests + 16 Node test files + syntax checks)."
