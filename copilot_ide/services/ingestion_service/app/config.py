import os
from pathlib import Path

APP_DIR = Path(__file__).resolve().parent
SERVICE_DIR = APP_DIR.parent
ROOT_DIR = SERVICE_DIR.parent.parent
dataset_env = os.getenv("DATASET_DIR")
if dataset_env:
    DATASET_DIR = Path(dataset_env)
elif os.path.exists("/dataset"):
    DATASET_DIR = Path("/dataset")
else:
    DATASET_DIR = ROOT_DIR / "dataset"

PORT = int(os.getenv("PORT", "8002"))
HOST = os.getenv("HOST", "0.0.0.0")
