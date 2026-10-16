"""Cost estimates from token usage. Prices are USD per 1M tokens; override in .env when they change."""
import os

INPUT_PER_M = float(os.getenv("AGAI_PRICE_INPUT_PER_M", "0"))
OUTPUT_PER_M = float(os.getenv("AGAI_PRICE_OUTPUT_PER_M", "0"))


def estimate_cost(adk_usage: dict, crew_usage: dict) -> dict:
    adk_in, adk_out = adk_usage.get("prompt_tokens", 0), adk_usage.get("output_tokens", 0)
    crew_in, crew_out = crew_usage.get("prompt_tokens", 0), crew_usage.get("completion_tokens", 0)

    def usd(i, o):
        return round(i / 1e6 * INPUT_PER_M + o / 1e6 * OUTPUT_PER_M, 5)
    return {
        "adk": {"input_tokens": adk_in, "output_tokens": adk_out, "usd": usd(adk_in, adk_out)},
        "crewai": {"input_tokens": crew_in, "output_tokens": crew_out, "usd": usd(crew_in, crew_out)},
        "total_usd": usd(adk_in + crew_in, adk_out + crew_out),
        "pricing": {"input_per_m": INPUT_PER_M, "output_per_m": OUTPUT_PER_M},
    }
