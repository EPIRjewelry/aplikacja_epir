"""
Lightweight MCP client stub for Epir ESOG Agent.
Replace the implementation with real HTTP calls to your Chat Worker / MCP server.
"""
import requests


class MCPClient:
    def __init__(self, base_url: str, timeout: int = 10):
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout

    def health(self):
        try:
            r = requests.get(self.base_url + "/health", timeout=self.timeout)
            return r.ok
        except Exception:
            return False

    def fetch_history(self, session_id: str):
        # Example call — adapt to your worker API
        url = f"{self.base_url}/history/{session_id}"
        r = requests.get(url, timeout=self.timeout)
        r.raise_for_status()
        return r.json()


if __name__ == "__main__":
    c = MCPClient("https://asystent.epirbizuteria.pl/apps/assistant")
    print(c.health())
