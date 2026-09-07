import datetime
from presentation.auth_middleware import get_current_user_context  # VIOLATION: Infrastructure -> Presentation

class AuditLogger:
    @staticmethod
    def log_action(action: str):
        # Infrastructure reaches into presentation auth token context
        user = get_current_user_context()
        print(f"[{datetime.datetime.now()}] Action: {action} by User: {user}")
