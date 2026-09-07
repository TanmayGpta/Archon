from typing import Dict
import logging

class InventoryService:
    def __init__(self):
        self.logger = logging.getLogger(__name__)

    def check_stock(self, item_id: str, quantity: int) -> bool:
        self.logger.info(f"Checking stock for {item_id}")
        return True

    def deduct_stock(self, item_id: str, quantity: int):
        self.logger.info(f"Deducted {quantity} from {item_id}")
