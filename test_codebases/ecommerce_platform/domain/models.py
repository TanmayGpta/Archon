from dataclasses import dataclass
from typing import List, Optional
from datetime import datetime
import uuid

@dataclass
class OrderItem:
    item_id: str
    quantity: int
    unit_price: float

@dataclass
class Order:
    order_id: str
    customer_id: str
    items: List[OrderItem]
    status: str
    created_at: datetime
    total_amount: float
