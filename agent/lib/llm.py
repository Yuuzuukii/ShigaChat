from typing import Any, AsyncIterator, TypeVar, Type, cast
from langchain_openai import ChatOpenAI
from pydantic import BaseModel

T = TypeVar("T", bound=BaseModel)

def _build_model(model: str, **kwargs: Any) -> ChatOpenAI: # temperatureやreasoning_effortをkwargで受け取る（可変）
    model_kwargs = kwargs.pop("model_kwargs", {})
    model_kwargs.update(kwargs)
    return ChatOpenAI(model=model, model_kwargs=model_kwargs)

async def call_llm(prompt: str, model: str, **kwargs: Any) -> str:
    model_client = _build_model(model=model, **kwargs)
    response = await model_client.ainvoke(prompt)
    content = response.content
    if isinstance(content, str):
        return content
    return response.text

# 回答生成用のストリーミングチャット
async def astream_llm(prompt: str, model: str, **kwargs: Any) -> AsyncIterator[str]:
    model_client = _build_model(model=model, **kwargs)
    async for chunk in model_client.astream(prompt): # チャンク単位でテキストを返す
        text = chunk.text
        if text:
            yield text

# 参照QA使用可否
async def call_llm_structured(prompt: str, schema: Type[T], model: str, **kwargs: Any) -> T:
    model_client = _build_model(model=model, **kwargs)
    structured_model = model_client.with_structured_output(schema)
    response = await structured_model.ainvoke(prompt)
    return cast(T, response)
