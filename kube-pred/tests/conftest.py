import sys
from pathlib import Path

# Make `kube_pred` importable when pytest runs from the repo root or from kube-pred/.
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
