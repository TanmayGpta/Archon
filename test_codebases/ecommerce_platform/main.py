import uvicorn
from presentation.api import app
from application.order_service import OrderService
from infrastructure.database import init_db

if __name__ == "__main__":
    init_db()
    uvicorn.run(app, host="0.0.0.0", port=8000)
