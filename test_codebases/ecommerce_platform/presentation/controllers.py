from typing import Any, Dict

class ResponseFormatter:
    @staticmethod
    def format_success(data: Any) -> Dict[str, Any]:
        return {"status": "success", "data": data}

    @staticmethod
    def format_error(message: str) -> Dict[str, Any]:
        return {"status": "error", "message": message}
