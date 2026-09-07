from fastapi import FastAPI
from presentation.order_routes import router as order_router

app = FastAPI(title="E-Commerce API")
app.include_router(order_router, prefix="/orders")
