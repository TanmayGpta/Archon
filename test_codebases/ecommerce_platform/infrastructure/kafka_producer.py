import json
import socket

class KafkaEventPublisher:
    def __init__(self, broker_url: str = "localhost:9092"):
        self.broker = broker_url
        self.host = socket.gethostname()

    def publish(self, topic: str, payload: dict):
        data = json.dumps(payload)
        print(f"[Kafka] Published to {topic}: {data}")
