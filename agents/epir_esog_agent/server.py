from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional
import uvicorn

from .agent import evaluate

app = FastAPI(title="ESOG Local Server")

# Allow CORS for local development so the chat UI can call this endpoint from the browser.
# In production, restrict `allow_origins` to trusted origins only.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class EsogRequest(BaseModel):
    text: str
    topk: Optional[int] = 3
    no_retrieval: Optional[bool] = False


@app.post('/esog')
async def esog_endpoint(req: EsogRequest):
    if not req.text or not req.text.strip():
        raise HTTPException(status_code=400, detail="Missing text")
    try:
        result = evaluate(req.text, use_retrieval=not req.no_retrieval, topk=req.topk)
        return result
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def run(host: str = '127.0.0.1', port: int = 8000):
    uvicorn.run('agents.epir_esog_agent.server:app', host=host, port=port, log_level='info')


if __name__ == '__main__':
    run()
