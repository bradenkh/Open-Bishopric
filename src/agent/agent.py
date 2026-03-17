import os

from langchain_openai import ChatOpenAI
from langchain.agents import create_agent
from langchain_core.messages import HumanMessage

from src.agent.prompts import SYSTEM_PROMPT
from src.agent.tools import ALL_TOOLS, set_request_context

_agent = None


def _get_llm():
    return ChatOpenAI(
        model=os.environ.get("ZAI_MODEL", "glm-4.7-flash"),
        openai_api_key=os.environ["ZAI_API_KEY"],
        openai_api_base="https://api.z.ai/api/paas/v4/",
        temperature=0.3,
        max_tokens=1024,
    )


def _get_agent():
    global _agent
    if _agent is None:
        llm = _get_llm()
        _agent = create_agent(
            model=llm,
            tools=ALL_TOOLS,
            system_prompt=SYSTEM_PROMPT,
            debug=os.environ.get("AGENT_VERBOSE", "").lower() == "true",
        )
    return _agent


def run_agent(text: str, slack_user_id: str, channel_id: str, say) -> str:
    """Run the agent with a user message and return the response text."""
    set_request_context(say, slack_user_id)
    try:
        agent = _get_agent()
        result = agent.invoke({"messages": [HumanMessage(content=text)]})
        messages = result.get("messages", [])
        # Get the last AI message content
        for msg in reversed(messages):
            if hasattr(msg, "content") and msg.content and msg.type == "ai":
                return msg.content
        return "I wasn't able to process that request."
    except Exception as e:
        return f"Sorry, I encountered an error: {e}"
